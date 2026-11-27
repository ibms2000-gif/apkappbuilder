interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  GROQ_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GH_TOKEN?: string;
  BUILD_TOKEN?: string;
  GITHUB_REPOSITORY?: string;
  GITHUB_REF?: string;
  GROQ_MODEL?: string;
  GEMINI_MODEL?: string;
  AI_PROVIDER?: string;
  DEVICE_DAILY_LIMIT?: string;
  GROQ_DAILY_REQUEST_CAP?: string;
  GEMINI_DAILY_REQUEST_CAP?: string;
}
type Provider = "groq" | "gemini";
type GeneratedApp = { appName: string; packageName: string; summary: string; mainActivity: string };
const MAX_SOURCE_LENGTH = 70000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: {
    "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff"
  }});
}
function readLimit(value: string | undefined, fallback: number): number {
  const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
function today(): string { return new Date().toISOString().slice(0, 10); }
function validDeviceId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9-]{20,80}$/i.test(value);
}
function makePackageName(id: string): string {
  return "com.apkappbuilder.generated.p" + id.replace(/-/g, "").slice(0, 10);
}
function parseModelJson(text: string): GeneratedApp {
  const cleaned = text.trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("لم يرجع النموذج JSON صالحاً.");
  const parsed = JSON.parse(cleaned.slice(first, last + 1)) as Partial<GeneratedApp>;
  if (typeof parsed.mainActivity !== "string") throw new Error("لم يُنشأ ملف MainActivity.kt.");
  return {
    appName: typeof parsed.appName === "string" ? parsed.appName.slice(0, 48) : "تطبيقي الجديد",
    packageName: typeof parsed.packageName === "string" ? parsed.packageName : "",
    summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 500) : "",
    mainActivity: parsed.mainActivity
  };
}
function validateGeneratedApp(app: GeneratedApp, expectedPackage: string): void {
  if (app.mainActivity.length > MAX_SOURCE_LENGTH) throw new Error("الكود الناتج أكبر من الحد المسموح.");
  const firstLine = app.mainActivity.trimStart().split(/\r?\n/, 1)[0].trim();
  if (firstLine !== "package " + expectedPackage) throw new Error("تعذر التحقق من اسم الحزمة في الكود.");
  if (!/class\s+MainActivity\s*:\s*ComponentActivity\s*\(/.test(app.mainActivity)) throw new Error("يجب أن يحتوي الكود على MainActivity ترث ComponentActivity.");
  if (!/setContent\s*\{/.test(app.mainActivity)) throw new Error("لم يتم العثور على واجهة Jetpack Compose.");
  if (/\b(GROQ_API_KEY|GEMINI_API_KEY|GH_TOKEN|BUILD_TOKEN)\b/.test(app.mainActivity)) throw new Error("تم رفض كود يحتوي على مؤشرات لمفاتيح أو أسرار.");
  app.appName = app.appName.replace(/[^\p{L}\p{N} ._-]/gu, "").trim().slice(0, 48) || "تطبيقي الجديد";
}
function systemPrompt(packageName: string): string {
  return [
    "أنت مهندس Android خبير. اكتب ملف Kotlin كاملاً اسمه MainActivity.kt لتطبيق Android أصلي باستخدام Kotlin وJetpack Compose فقط.",
    "أعد JSON صالحاً فقط بالمفاتيح: appName, packageName, summary, mainActivity.",
    "packageName يجب أن يكون حرفياً: " + packageName + " وأول سطر في mainActivity يجب أن يكون: package " + packageName,
    "يجب أن يحتوي الملف على class MainActivity : ComponentActivity() ويستدعي setContent { }.",
    "استخدم Material 3 وCompose. أضف imports اللازمة صراحة. صمم واجهة عربية RTL افتراضياً عند ملاءمة الوصف.",
    "نفّذ وظائف تفاعلية حقيقية محلية باستخدام remember وmutableStateOf وCompose.",
    "استخدم Android SDK وJetpack Compose وMaterial3 وKotlin القياسي فقط. لا تعتمد على ملفات أو مكتبات خارجية.",
    "لا تضف صلاحيات أو خدمات أو Activities أخرى. لا تفترض موارد مخصصة. لا تستخدم WebView أو shell أو تحميل كود.",
    "لا تضع مفاتيح أو أسراراً في التطبيق، ولا ترسل بيانات المستخدم إلى خوادم خارجية. لا تستخدم الإنترنت في النسخة الأولية.",
    "لا تخرج Markdown أو سياج كود. أخرج JSON فقط مع mainActivity كسلسلة JSON صحيحة الهروب.",
    "إذا كان المطلوب واسعاً، أنشئ نسخة أولية عملية قابلة للبناء بأفضل الوظائف المحلية الممكنة."
  ].join("\n");
}
async function reserveDevice(db: D1Database, deviceId: string, limit: number): Promise<boolean> {
  const result = await db.prepare(
    "INSERT INTO device_usage (usage_day, device_id, generations) VALUES (?, ?, 1) " +
    "ON CONFLICT(usage_day, device_id) DO UPDATE SET generations = generations + 1 WHERE generations < ? RETURNING generations"
  ).bind(today(), deviceId, limit).first<{ generations: number }>();
  return result !== null;
}
async function reserveProvider(db: D1Database, provider: Provider, limit: number): Promise<boolean> {
  const result = await db.prepare(
    "INSERT INTO provider_usage (usage_day, provider, requests) VALUES (?, ?, 1) " +
    "ON CONFLICT(usage_day, provider) DO UPDATE SET requests = requests + 1 WHERE requests < ? RETURNING requests"
  ).bind(today(), provider, limit).first<{ requests: number }>();
  return result !== null;
}
async function recordTokens(db: D1Database, provider: Provider, inputTokens: number, outputTokens: number): Promise<void> {
  await db.prepare("UPDATE provider_usage SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ? WHERE usage_day = ? AND provider = ?")
    .bind(Math.max(0, inputTokens), Math.max(0, outputTokens), today(), provider).run();
}
async function callGroq(env: Env, prompt: string, packageName: string): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  if (!env.GROQ_API_KEY) throw new Error("GROQ_API_KEY غير مضبوط.");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", headers: { authorization: "Bearer " + env.GROQ_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.GROQ_MODEL || "openai/gpt-oss-20b",
      messages: [{ role: "system", content: systemPrompt(packageName) }, { role: "user", content: prompt }],
      temperature: 0.2, max_completion_tokens: 12000, response_format: { type: "json_object" }
    })
  });
  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(payload.error?.message || "Groq API error: " + response.status);
  const text = payload.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq لم يرجع محتوى.");
  return { text, inputTokens: payload.usage?.prompt_tokens || 0, outputTokens: payload.usage?.completion_tokens || 0 };
}
async function callGemini(env: Env, prompt: string, packageName: string): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY غير مضبوط.");
  const model = env.GEMINI_MODEL || "gemini-3.8-flash";
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt(packageName) }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 12000 }
    })
  });
  const payload = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }; error?: { message?: string };
  };
  if (!response.ok) throw new Error(payload.error?.message || "Gemini API error: " + response.status);
  const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("");
  if (!text) throw new Error("Gemini لم يرجع محتوى.");
  return { text, inputTokens: payload.usageMetadata?.promptTokenCount || 0, outputTokens: payload.usageMetadata?.candidatesTokenCount || 0 };
}
async function generateWithProviders(env: Env, prompt: string, packageName: string): Promise<{ app: GeneratedApp; provider: Provider }> {
  const first = (env.AI_PROVIDER || "auto").toLowerCase() === "gemini" ? "gemini" : "groq";
  const order: Provider[] = first === "gemini" ? ["gemini", "groq"] : ["groq", "gemini"];
  const failures: string[] = [];
  for (const provider of order) {
    const keyExists = provider === "groq" ? Boolean(env.GROQ_API_KEY) : Boolean(env.GEMINI_API_KEY);
    if (!keyExists) { failures.push(provider + ": المفتاح غير مضبوط"); continue; }
    const cap = provider === "groq" ? readLimit(env.GROQ_DAILY_REQUEST_CAP, 40) : readLimit(env.GEMINI_DAILY_REQUEST_CAP, 40);
    if (!(await reserveProvider(env.DB, provider, cap))) { failures.push(provider + ": وصلنا إلى السقف اليومي الداخلي"); continue; }
    try {
      const result = provider === "groq" ? await callGroq(env, prompt, packageName) : await callGemini(env, prompt, packageName);
      await recordTokens(env.DB, provider, result.inputTokens, result.outputTokens);
      const app = parseModelJson(result.text);
      validateGeneratedApp(app, packageName);
      return { app, provider };
    } catch (error) {
      failures.push(provider + ": " + (error instanceof Error ? error.message : "خطأ غير معروف"));
    }
  }
  throw new Error("تعذر التوليد. " + failures.join(" | "));
}
async function dispatchBuild(env: Env, projectId: string): Promise<void> {
  if (!env.GH_TOKEN) throw new Error("لم يتم إعداد GH_TOKEN في أسرار Worker.");
  const repo = env.GITHUB_REPOSITORY || "ibms2000-gif/apkappbuilder";
  const ref = env.GITHUB_REF || "main";
  const response = await fetch("https://api.github.com/repos/" + repo + "/actions/workflows/build-apk.yml/dispatches", {
    method: "POST", headers: {
      authorization: "Bearer " + env.GH_TOKEN, accept: "application/vnd.github+json",
      "content-type": "application/json", "x-github-api-version": "2022-11-28", "user-agent": "apkappbuilder-worker"
    },
    body: JSON.stringify({ ref, inputs: { project_id: projectId } })
  });
  if (!response.ok) throw new Error("فشل تشغيل GitHub Actions (" + response.status + "): " + (await response.text()).slice(0, 500));
}
async function handleGenerate(request: Request, env: Env): Promise<Response> {
  if (!env.DB) return json({ error: "قاعدة بيانات D1 غير مربوطة." }, 503);
  let body: { prompt?: unknown; deviceId?: unknown; appName?: unknown; creatorName?: unknown };
  try { body = await request.json() as typeof body; } catch { return json({ error: "بيانات الطلب غير صالحة." }, 400); }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 12 || prompt.length > 5000) return json({ error: "اكتب وصفاً من 12 إلى 5000 حرف." }, 400);
  const creatorName = typeof body.creatorName === "string" ? body.creatorName.trim().replace(/[<>\r\n]/g, "").slice(0, 80) : "";
  if (creatorName.length < 2) return json({ error: "أدخل اسم الطالب أو منشئ التطبيق (حرفان على الأقل)." }, 400);
  if (!validDeviceId(body.deviceId)) return json({ error: "معرّف الجهاز غير صالح." }, 400);
  const deviceId = body.deviceId;
  const limit = readLimit(env.DEVICE_DAILY_LIMIT, 2);
  if (!(await reserveDevice(env.DB, deviceId, limit))) return json({ error: "انتهت حصتك التجريبية لهذا اليوم (" + limit + " محاولات). حاول بعد تجدد الحصة اليومية." }, 429);
  const id = crypto.randomUUID();
  const packageName = makePackageName(id);
  try {
    const result = await generateWithProviders(env, prompt, packageName);
    const appName = typeof body.appName === "string" && body.appName.trim()
      ? body.appName.trim().replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 48) : result.app.appName;
    await env.DB.prepare(
      "INSERT INTO projects (id, device_id, prompt, app_name, creator_name, package_name, main_activity, summary, provider, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'generated')"
    ).bind(id, deviceId, prompt, appName, creatorName, packageName, result.app.mainActivity, result.app.summary, result.provider).run();
    let buildStarted = false;
    let message = "تم توليد الكود. أضف إعدادات GitHub Actions لتشغيل البناء تلقائياً.";
    if (env.GH_TOKEN && env.BUILD_TOKEN) {
      try {
        await env.DB.prepare("UPDATE projects SET status = 'building', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
        await dispatchBuild(env, id);
        buildStarted = true;
        message = "تم إنشاء المشروع وبدأ بناء APK عبر GitHub Actions.";
      } catch (error) {
        message = error instanceof Error ? error.message : "تعذر بدء البناء.";
        await env.DB.prepare("UPDATE projects SET status = 'generated', error_message = ?, updated_at = ? WHERE id = ?")
          .bind(message, new Date().toISOString(), id).run();
      }
    }
    return json({ projectId: id, appName, summary: result.app.summary, provider: result.provider, status: buildStarted ? "building" : "generated", message }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "حدث خطأ أثناء التوليد." }, 502);
  }
}
async function handleProject(request: Request, env: Env, id: string): Promise<Response> {
  const deviceId = new URL(request.url).searchParams.get("device_id");
  if (!validDeviceId(deviceId)) return json({ error: "معرّف الجهاز مفقود." }, 400);
  const p = await env.DB.prepare("SELECT id, app_name, creator_name, summary, provider, status, error_message, created_at, release_url, apk_url, report_url FROM projects WHERE id = ? AND device_id = ?")
    .bind(id, deviceId).first<{ id: string; app_name: string; creator_name: string; summary: string; provider: string; status: string; error_message: string | null; created_at: string; release_url: string | null; apk_url: string | null; report_url: string | null }>();
  if (!p) return json({ error: "المشروع غير موجود." }, 404);
  return json({
    projectId: p.id, appName: p.app_name, creatorName: p.creator_name, summary: p.summary, provider: p.provider, status: p.status,
    error: p.error_message, createdAt: p.created_at, releaseUrl: p.release_url, downloadUrl: p.apk_url, reportUrl: p.report_url
  });
}
async function handleList(request: Request, env: Env): Promise<Response> {
  const deviceId = new URL(request.url).searchParams.get("device_id");
  if (!validDeviceId(deviceId)) return json({ error: "معرّف الجهاز مفقود." }, 400);
  const rows = await env.DB.prepare("SELECT id, app_name, creator_name, summary, provider, status, error_message, created_at, release_url, apk_url, report_url FROM projects WHERE device_id = ? ORDER BY created_at DESC LIMIT 30").bind(deviceId).all();
  return json({ projects: rows.results || [] });
}
async function handleUsage(request: Request, env: Env): Promise<Response> {
  const deviceId = new URL(request.url).searchParams.get("device_id");
  if (!validDeviceId(deviceId)) return json({ error: "معرّف الجهاز مفقود." }, 400);
  const device = await env.DB.prepare("SELECT generations FROM device_usage WHERE usage_day = ? AND device_id = ?")
    .bind(today(), deviceId).first<{ generations: number }>();
  const providers = await env.DB.prepare("SELECT provider, requests, input_tokens, output_tokens FROM provider_usage WHERE usage_day = ?").bind(today()).all();
  return json({ date: today(), device: { used: device?.generations || 0, limit: readLimit(env.DEVICE_DAILY_LIMIT, 2) }, platformProviders: providers.results || [] });
}
async function isBuildAuthorized(request: Request, env: Env): Promise<boolean> {
  const expected = env.BUILD_TOKEN || "";
  const supplied = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || !supplied || supplied.length !== expected.length) return false;
  const a = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(supplied)));
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(expected)));
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function buildSource(request: Request, env: Env): Promise<Response> {
  if (!(await isBuildAuthorized(request, env))) return json({ error: "غير مصرح." }, 401);
  const id = new URL(request.url).searchParams.get("project_id") || "";
  const p = await env.DB.prepare("SELECT id, app_name, creator_name, package_name, main_activity, summary, created_at FROM projects WHERE id = ?")
    .bind(id).first<{ id: string; app_name: string; creator_name: string; package_name: string; main_activity: string; summary: string; created_at: string }>();
  if (!p) return json({ error: "المشروع غير موجود." }, 404);
  return json({ project_id: p.id, app_name: p.app_name, creator_name: p.creator_name, package_name: p.package_name, main_activity: p.main_activity, summary: p.summary, created_at: p.created_at });
}
async function buildPublished(request: Request, env: Env): Promise<Response> {
  if (!(await isBuildAuthorized(request, env))) return json({ error: "غير مصرح." }, 401);
  const body = await request.json() as { project_id?: string; release_url?: string; apk_url?: string; report_url?: string };
  const id = body.project_id || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "معرّف المشروع غير صالح." }, 400);
  const safeGitHubUrl = (value: string | undefined, needsDownload: boolean): boolean => {
    if (!value) return false;
    try {
      const u = new URL(value);
      return u.protocol === "https:" && u.hostname === "github.com" &&
        u.pathname.startsWith("/ibms2000-gif/apkappbuilder/releases/") &&
        (!needsDownload || u.pathname.includes("/download/"));
    } catch { return false; }
  };
  if (!safeGitHubUrl(body.release_url, false) || !safeGitHubUrl(body.apk_url, true) || !safeGitHubUrl(body.report_url, true)) {
    return json({ error: "روابط GitHub Releases غير صالحة." }, 400);
  }
  const result = await env.DB.prepare(
    "UPDATE projects SET status = 'ready', release_url = ?, apk_url = ?, report_url = ?, error_message = NULL, updated_at = ? WHERE id = ?"
  ).bind(body.release_url, body.apk_url, body.report_url, new Date().toISOString(), id).run();
  if (!result.success || result.meta.changes === 0) return json({ error: "المشروع غير موجود أو لم يتم تحديثه." }, 404);
  return json({ ok: true, status: "ready", release_url: body.release_url, apk_url: body.apk_url, report_url: body.report_url });
}
async function buildFailure(request: Request, env: Env): Promise<Response> {
  if (!(await isBuildAuthorized(request, env))) return json({ error: "غير مصرح." }, 401);
  const body = await request.json() as { project_id?: string; error?: string };
  if (!body.project_id) return json({ error: "معرّف المشروع مفقود." }, 400);
  await env.DB.prepare("UPDATE projects SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?")
    .bind((body.error || "فشل بناء APK. راجع سجل GitHub Actions.").slice(0, 1000), new Date().toISOString(), body.project_id).run();
  return json({ ok: true });
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        if (request.method === "POST" && url.pathname === "/api/generate") {
          return await handleGenerate(request, env);
        }
        if (request.method === "GET" && url.pathname === "/api/projects") {
          return await handleList(request, env);
        }
        const projectMatch = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})$/i);
        if (request.method === "GET" && projectMatch) {
          return await handleProject(request, env, projectMatch[1]);
        }
        if (request.method === "GET" && url.pathname === "/api/usage") {
          return await handleUsage(request, env);
        }
        if (request.method === "GET" && url.pathname === "/api/build/source") {
          return await buildSource(request, env);
        }
        if (request.method === "POST" && url.pathname === "/api/build/published") {
          return await buildPublished(request, env);
        }
        if (request.method === "POST" && url.pathname === "/api/build/failure") {
          return await buildFailure(request, env);
        }
        return json({ error: "المسار غير موجود." }, 404);
      } catch (error) {
        console.error(JSON.stringify({ event: "request_error", path: url.pathname, error: error instanceof Error ? error.message : "unknown" }));
        return json({ error: "حدث خطأ داخلي. راجع سجلات Worker." }, 500);
      }
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("APK App Builder API", { status: 200 });
  }
};
