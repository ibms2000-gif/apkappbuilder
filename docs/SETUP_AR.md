# إعداد APK App Builder — بدون R2

## ما تم تجهيزه مسبقاً

- حساب Cloudflare متصل.
- قاعدة D1 باسم `apkappbuilder-db` أُنشئت بالفعل في منطقة APAC.
- تم إنشاء الجداول الأساسية وربط معرّف D1 ومعرّف حسابك في `wrangler.jsonc`.
- أضيفت ترحيلة `0002_github_releases_and_reports.sql` لإضافة اسم منشئ التطبيق وروابط GitHub Releases وAPK وPDF.
- أضيف سير عمل نشر Worker وسير عمل بناء APK وإنشاء تقرير PDF ونشرهما في GitHub Releases.
- لن نستخدم R2، ولا يلزم تفعيله أو إنشاء Bucket.

## 1. مفاتيح الذكاء الاصطناعي

أنشئ مفاتيح API من:

- [Groq Console](https://console.groq.com/keys)
- [Google AI Studio](https://aistudio.google.com/app/apikey)

لا ترسل المفاتيح في المحادثة ولا تضعها في ملفات الكود.

## 2. Cloudflare API Token

من [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)، أنشئ Custom Token واجعل صلاحياته محصورة في الحساب المطلوب:

| الخدمة | الصلاحية |
|---|---|
| Workers Scripts | Edit |
| D1 | Edit |

لا نحتاج صلاحية R2 أو Zones لهذا المشروع. احتفظ بالرمز لإضافته في GitHub باسم `CLOUDFLARE_API_TOKEN`.

## 3. GitHub Fine-grained Personal Access Token

من [GitHub Fine-grained tokens](https://github.com/settings/personal-access-tokens/new)، أنشئ رمزاً بهذه الإعدادات:

- Repository access: Only select repositories → اختر `apkappbuilder` فقط.
- Repository permissions:
  - Actions: Read and write.
  - Contents: Read-only.
  - Metadata: Read-only (غالباً إلزامية).

يستخدم Worker هذا الرمز لإطلاق سير عمل بناء التطبيق. لا يحتاج إلى صلاحية كتابة Contents؛ سير عمل البناء نفسه يستخدم `GITHUB_TOKEN` مؤقتاً مع `contents: write` لإنشاء GitHub Release وإرفاق الملفات.

أضف الرمز في GitHub Secret باسم `APKAPPBUILDER_GH_TOKEN`.

## 4. رمز الربط الداخلي

أنشئ قيمة عشوائية طويلة على جهازك، مثلاً عبر PowerShell:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToHexString($bytes).ToLower()
```

أضفها باسم `APKAPPBUILDER_BUILD_TOKEN` في GitHub Secrets. سير عمل النشر ينسخها إلى Worker باسم `BUILD_TOKEN`، وتستخدم القيمة نفسها بين Worker وسير عمل البناء.

## 5. أضف أسرار GitHub

في المستودع افتح:
**Settings → Secrets and variables → Actions → New repository secret**

أضف الأسرار التالية:

| الاسم | القيمة |
|---|---|
| `CLOUDFLARE_API_TOKEN` | رمز Cloudflare بصلاحيات Workers Scripts Edit وD1 Edit |
| `GROQ_API_KEY` | مفتاح Groq |
| `GEMINI_API_KEY` | مفتاح Gemini |
| `APKAPPBUILDER_GH_TOKEN` | GitHub Fine-grained token من الخطوة 3 |
| `APKAPPBUILDER_BUILD_TOKEN` | القيمة العشوائية من الخطوة 4 |

لا تضع علامات اقتباس حول القيم، ولا ترسلها في المحادثة.

## 6. انشر المنصة

بعد إضافة الأسرار الخمسة:

1. افتح تبويب **Actions** في المستودع.
2. اختر **Deploy APK App Builder to Cloudflare**.
3. اضغط **Run workflow** على الفرع `main`.
4. يفحص سير العمل TypeScript، ويطبق ترحيلات D1، وينشر Worker والواجهة، ثم يضيف أسرار Groq وGemini وGitHub ورمز الربط إلى Worker.

رابط سير العمل:
[Deploy APK App Builder to Cloudflare](https://github.com/ibms2000-gif/apkappbuilder/actions/workflows/deploy-cloudflare.yml)

## 7. أضف عنوان Worker إلى GitHub

بعد نجاح النشر، انسخ عنوان Worker من سجل النشر أو صفحة Workers & Pages في Cloudflare. ثم أضف GitHub Secret جديداً:

- الاسم: `APKAPPBUILDER_API_URL`
- القيمة: رابط Worker فقط، دون `/api` في النهاية.

هذا العنوان يسمح لسير عمل البناء بجلب مصدر المشروع وإبلاغ Worker بنجاح نشر الملفات.

## 8. كيف يتم إنشاء مشروع الإنجاز؟

1. يكتب الطالب اسم التطبيق واسمه/اسم المنشئ ووصف التطبيق.
2. يحلل Worker الوصف ويستدعي Groq، ثم Gemini كخيار احتياطي.
3. يحفظ D1 بيانات المشروع ومصدر Kotlin واسم الطالب.
4. يشغّل Worker سير عمل GitHub Actions.
5. يبني GitHub Actions ملف Debug APK باستخدام Kotlin وJetpack Compose.
6. ينشئ GitHub Release عاماً مستقلاً لكل مشروع.
7. يرفع APK إلى الإصدار.
8. ينشئ تقرير PDF عربياً من صفحة واحدة يحتوي على اسم التطبيق، اسم الطالب، الوصف المختصر، التاريخ، ورمز QR يفتح رابط APK.
9. يرفع PDF إلى الإصدار نفسه.
10. يحفظ Worker روابط الإصدار وAPK وPDF في D1، ويعرض زري التنزيل في قائمة المشاريع.

## 9. علنية الملفات وخصوصية الطلاب

المستودع عام؛ لذلك ستكون إصدارات GitHub وملفات APK وتقارير PDF وروابط التنزيل عامة وقابلة للمشاركة. سيظهر اسم الطالب/منشئ التطبيق في تقرير PDF العام. لا تستخدم أسماء أو بيانات شخصية إلا بموافقة مناسبة من الطالب والمدرسة أو المسؤول.

## حدود النسخة الحالية

- الحصة الافتراضية محاولتان يومياً لكل معرّف متصفح. هذا حاجز تجريبي ويمكن التحايل عليه بتغيير المتصفح؛ ليس نظام عضويات أو حماية إنتاجية.
- الحصص الداخلية لا تتجاوز حدود Groq وGemini الفعلية ولا تضمن ثباتها.
- لا توجد معاينة Android مباشرة في المتصفح.
- المخرجات الحالية تطبيق Compose أولي بملف `MainActivity.kt` واحد؛ الوظائف التي تحتاج صلاحيات حساسة أو خدمات خلفية أو ملفات موارد متعددة تحتاج تطويراً لاحقاً.
- الناتج الحالي Debug APK للتجربة، وليس إصدار Release موقعاً بمفتاح نشر خاص.
- يمكن إضافة توقيع Release وإصدارات AAB لاحقاً بعد تجهيز إدارة آمنة لمفاتيح التوقيع.

## النماذج الافتراضية

- Groq: `openai/gpt-oss-20b`
- Gemini: `gemini-3.8-flash`

يبدأ Worker بـ Groq ويجرب Gemini عند تعذر Groq أو بلوغ السقف الداخلي. تأكد من توفر النموذج وحدوده في حساب المزود وقت الاستخدام.
