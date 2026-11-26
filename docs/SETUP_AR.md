# إعداد وتشغيل APK App Builder

هذا المستودع يحتوي على MVP أولي. لكي يتحول إلى خدمة عاملة، يلزم ربطه بحساب Cloudflare وإضافة مفاتيح Groq/Gemini ومفتاح تشغيل GitHub Actions. لا تضع أي مفتاح داخل ملفات المصدر.

## 1. تجهيز المتطلبات

- حساب Cloudflare.
- حساب Groq API ومفتاح API.
- مشروع Google AI Studio ومفتاح Gemini API.
- صلاحية إدارة المستودع وإضافة GitHub Actions secrets.

## 2. إنشاء موارد Cloudflare

من مجلد المشروع شغّل:

```bash
npm install
npx wrangler login
npx wrangler d1 create apkappbuilder-db
npx wrangler r2 bucket create apkappbuilder-builds
```

انسخ قيمة database_id التي يعرضها أمر D1، واستبدل النص `REPLACE_WITH_D1_DATABASE_ID` في ملف `wrangler.jsonc`.

## 3. إعداد الأسرار

أنشئ قيمة عشوائية طويلة لاستخدامها كرمز داخلي بين Worker وGitHub Actions، مثلاً:

```bash
openssl rand -hex 32
```

احتفظ بالقيمة الناتجة؛ ستدخلها في Cloudflare وفي GitHub Actions دون وضعها في ملفات المشروع.

أضف أسرار Worker:

```bash
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put BUILD_TOKEN
npx wrangler secret put GH_TOKEN
```

- `GROQ_API_KEY`: مفتاح Groq.
- `GEMINI_API_KEY`: مفتاح Gemini.
- `BUILD_TOKEN`: الرمز العشوائي المشترك بين Worker وGitHub Actions.
- `GH_TOKEN`: GitHub fine-grained personal access token للمستودع، بصلاحية Actions: Read and write. يستخدمه Worker لتشغيل workflow فقط.

## 4. إعداد أسرار GitHub

افتح المستودع ثم Settings → Secrets and variables → Actions → New repository secret، وأضف:

| الاسم | القيمة |
|---|---|
| `APKAPPBUILDER_API_URL` | رابط Worker بعد نشره، مثل `https://apkappbuilder.<account>.workers.dev` |
| `APKAPPBUILDER_BUILD_TOKEN` | نفس قيمة `BUILD_TOKEN` التي أضفتها إلى Cloudflare |

لا تستخدم مسافة أخيرة في الرابط أو الرمز.

## 5. تطبيق قاعدة البيانات والنشر

بعد تعديل معرّف D1 في `wrangler.jsonc`:

```bash
npx wrangler d1 migrations apply apkappbuilder-db --remote
npx wrangler deploy
```

افتح رابط Worker. يجب أن يعرض المسار `/api/health` استجابة JSON تتضمن `ok: true`.

## 6. كيف يعمل المسار

1. يرسل المتصفح الوصف إلى Worker.
2. يطبّق Worker الحصة اليومية ثم يستدعي Groq، ويجرب Gemini عند تعذر Groq.
3. يحفظ Worker مصدر Kotlin في D1.
4. يشغّل Worker workflow `build-apk.yml` عبر GitHub API.
5. ينزّل GitHub Actions مصدر المشروع، ويركّبه في قالب Android ثابت، ثم يبني Debug APK.
6. يرفع GitHub Actions الملف إلى Worker، ويحفظه Worker في R2.
7. يظهر زر تنزيل APK في قائمة مشاريع المتصفح الذي أنشأه.

## حدود النسخة الحالية

- الحصة الافتراضية: محاولتان لكل معرّف متصفح يومياً، مع سقف داخلي قابل للتعديل لطلبات كل مزود. معرّف المتصفح محفوظ محلياً ويمكن تغييره؛ لذلك هذا حاجز تجريبي وليس نظام عضويات أو حماية احترافية من إساءة الاستخدام.
- الحصص الداخلية لا تضمن أن مزود الذكاء الاصطناعي لن يرفض الطلب أو يفرض حداً أقل. راجع صفحة حدود الاستخدام في حساب Groq وGemini دورياً.
- لا توجد معاينة Android مباشرة داخل المتصفح بعد؛ تعرض الصفحة المشاريع وحالة البناء والتنزيل.
- المخرجات حالياً تطبيق Compose بملف MainActivity واحد. الوظائف التي تحتاج صلاحيات حساسة أو خدمات خلفية أو موارد خارجية لا تضاف تلقائياً.
- ينتج البناء الحالي Debug APK تجريبياً، وليس إصدار Release موقعاً بمفتاح نشر خاص بالمستخدم.
- لا تفتح الخدمة للعامة قبل إضافة تسجيل دخول/حماية من الروبوتات، ومراجعة الكود المولّد، وضبط حصص مزودي الذكاء الاصطناعي.
- لا ترسل كلمات مرور أو مفاتيح أو بيانات شخصية حساسة في البرومبت. راجع شروط خصوصية مزودي الذكاء الاصطناعي قبل تشغيل الخدمة العامة.

## نماذج الذكاء الاصطناعي

القيم الافتراضية في `wrangler.jsonc` هي `openai/gpt-oss-20b` لـ Groq و`gemini-3.8-flash` لـ Gemini. يمكن تغييرهما من متغيرات Worker إذا تغير توفر النماذج أو الحصص. وضع `AI_PROVIDER=auto` يجعل Groq المحاولة الأولى وGemini احتياطياً.
