# إعداد وتشغيل APK App Builder

## الحالة الحالية

- تم إنشاء قاعدة D1 باسم `apkappbuilder-db` في حساب Cloudflare المتصل.
- تم تطبيق جداول `projects` و`device_usage` و`provider_usage` والفهرس الخاص بالمشاريع.
- تم تثبيت معرّف D1 ومعرّف حساب Cloudflare في `wrangler.jsonc`.
- لم يتم إنشاء R2 بعد؛ حسابك يطلب تفعيل R2 من لوحة Cloudflare أولاً.
- تم تجهيز سير عمل يدوي للنشر: **Actions → Deploy APK App Builder to Cloudflare**.

## 1. فعّل R2 وأنشئ مساحة التخزين

افتح [Cloudflare Dashboard](https://dash.cloudflare.com/) ثم:

1. اختر الحساب المرتبط بالمشروع.
2. افتح **R2 Object Storage**.
3. اضغط **Get started / Enable R2** وأكمل خطوة التفعيل أو إعداد الفوترة التي تعرضها Cloudflare.
4. أنشئ bucket بالاسم الدقيق: `apkappbuilder-builds`.

هذا الاسم موجود في ملف `wrangler.jsonc`. لا تغيّره إلا إذا عدّلت الملف أيضاً.

## 2. أنشئ Cloudflare API Token للنشر

من Cloudflare Dashboard افتح **My Profile → API Tokens → Create Token → Create Custom Token**.

اجعل الموارد محصورة في حسابك فقط، وأضف الصلاحيات التالية:

| الخدمة | الصلاحية |
|---|---|
| Workers Scripts | Edit |
| D1 | Edit |
| Workers R2 Storage | Edit |

لا تمنح صلاحية **All zones** أو صلاحيات حسابات أخرى؛ هذا المشروع لا يحتاجها. احتفظ بالرمز الناتج لأنه سيضاف إلى GitHub كسرّ باسم `CLOUDFLARE_API_TOKEN`.

## 3. جهّز مفاتيح الذكاء الاصطناعي

أنشئ مفاتيح API من:
- [Groq Console](https://console.groq.com/keys)
- [Google AI Studio](https://aistudio.google.com/app/apikey)

لا ترسل المفاتيح في المحادثة أو تضعها في ملفات الكود. أضفها إلى GitHub Secrets بالأسماء المحددة في الخطوة التالية.

## 4. أنشئ GitHub Fine-grained Personal Access Token

من [GitHub Developer Settings → Personal access tokens](https://github.com/settings/personal-access-tokens) أنشئ **Fine-grained token** بهذه الإعدادات:

- Repository access: اختر **Only select repositories** ثم `apkappbuilder` فقط.
- Repository permissions:
  - **Actions: Read and write**.
  - **Contents: Read-only**.
  - **Metadata: Read-only** (تكون عادةً إلزامية).
- لا تضف صلاحيات Issues أو Administration أو أسرار المستودع.

يستخدم هذا الرمز من Worker لتشغيل workflow البناء `build-apk.yml` عند طلب بناء تطبيق. أضفه باسم `APKAPPBUILDER_GH_TOKEN`.

## 5. أنشئ رمز ربط داخلياً

أنشئ قيمة عشوائية طويلة على جهازك، مثلاً:

```bash
openssl rand -hex 32
```

احتفظ بها كقيمة واحدة؛ ستستخدمها باسم `APKAPPBUILDER_BUILD_TOKEN` في GitHub. سير عمل النشر ينسخها إلى Worker باسم `BUILD_TOKEN`، وسير عمل البناء يستخدم النسخة نفسها للتحقق من طلبات المصدر ورفع APK.

## 6. أضف GitHub Actions Secrets

في المستودع افتح:
**Settings → Secrets and variables → Actions → New repository secret**

أضف الأسرار التالية:

| الاسم المطلوب | ماذا تضع فيه؟ |
|---|---|
| `CLOUDFLARE_API_TOKEN` | رمز Cloudflare الذي أنشأته في الخطوة 2 |
| `GROQ_API_KEY` | مفتاح Groq API |
| `GEMINI_API_KEY` | مفتاح Google Gemini API |
| `APKAPPBUILDER_GH_TOKEN` | GitHub Fine-grained token من الخطوة 4 |
| `APKAPPBUILDER_BUILD_TOKEN` | القيمة العشوائية من الخطوة 5 |

لا تضع علامات اقتباس حول القيم ولا تضف مسافات في نهايتها.

## 7. انشر المنصة

بعد تفعيل R2 وإنشاء bucket وإضافة الأسرار الخمسة:

1. افتح تبويب **Actions** في المستودع.
2. اختر **Deploy APK App Builder to Cloudflare**.
3. اضغط **Run workflow** على الفرع `main`.
4. انتظر حتى تنتهي خطوات فحص TypeScript ونشر Worker والأصول.

سير عمل النشر يطبّق ترحيلات قاعدة البيانات، وينشر الموقع وAPI، ثم يضيف أسرار Groq وGemini وGitHub ورمز الربط إلى Worker. لا يطبع قيم الأسرار في السجلات.

## 8. أضف عنوان Worker إلى GitHub

بعد نجاح النشر، خذ عنوان Worker الذي يعرضه سجل النشر أو صفحة **Workers & Pages**. أضف في GitHub Actions Secret جديداً:

- الاسم: `APKAPPBUILDER_API_URL`
- القيمة: عنوان Worker فقط، مثال شكلي `https://apkappbuilder.<workers-subdomain>.workers.dev`، دون إضافة `/api` أو شرطة مائلة في النهاية.

هذا العنوان يستخدمه سير عمل بناء APK للاتصال بالمنصة وإرجاع ملف APK إلى R2.

## 9. الاختبار

افتح عنوان Worker ثم:

- اختبر `/api/health` وتأكد من ظهور `ok: true`.
- اكتب وصف تطبيق تجريبي واضغط إنشاء.
- راقب **Actions → Build Android APK**.
- بعد اكتمال البناء ارجع إلى قائمة المشاريع واضغط تنزيل APK.

## حدود النسخة الحالية

- الحصة الافتراضية محاولتان يومياً لكل معرّف متصفح. هذا حاجز تجريبي فقط؛ معرّف المتصفح محفوظ محلياً ويمكن تغييره، فلا تعتبره حماية ضد إساءة الاستخدام أو بديلاً عن نظام مستخدمين.
- توجد حدود داخلية يومية للمزودين، لكنها لا تتجاوز ولا تلغي حدود Groq أو Gemini الفعلية.
- لا توجد معاينة Android مباشرة في المتصفح حالياً.
- المخرجات الحالية تطبيق Compose أولي بملف `MainActivity.kt` واحد، ولا تنشئ تلقائياً خدمات خلفية أو صلاحيات حساسة أو موارد متعددة.
- الناتج الحالي **Debug APK** للتجربة وليس إصدار Release موقعاً بمفتاح نشر.
- لا تفتح المنصة للجمهور قبل إضافة تسجيل دخول، وحماية من الروبوتات، وحدود أقوى للحصص ومراجعة الكود الناتج.
- تجنب إرسال كلمات المرور والمفاتيح والبيانات الحساسة في وصف التطبيق.

## نماذج الذكاء الاصطناعي الافتراضية

- Groq: `openai/gpt-oss-20b`
- Gemini: `gemini-3.8-flash`

يبدأ Worker بـ Groq، ثم يجرب Gemini عند تعذر Groq أو استنفاد سقفه الداخلي. يمكن تغيير أسماء النماذج من متغيرات Worker بعد مراجعة قائمة النماذج المتاحة لدى كل مزود.
