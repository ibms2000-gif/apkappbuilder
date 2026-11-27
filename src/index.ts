interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  GROQ_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GH_TOKEN?: string;
  BUILD_TOKEN?: string;
  ADMIN_TOKEN?: string;
  ADMIN_PASSWORD?: string;
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
function parseModelSource(text: string, prompt: string): GeneratedApp {
  let source = text.trim();
  if (source.charCodeAt(0) === 0xFEFF) source = source.slice(1).trim();
  // Some models wrap source in a small JSON object despite being asked for raw Kotlin.
  if (source.startsWith("{")) {
    try {
      const parsed = JSON.parse(source) as Record<string, unknown>;
      const candidate = parsed.code || parsed.kotlin || parsed.source || parsed.mainActivity || parsed.content;
      if (typeof candidate === "string") source = candidate.trim();
    } catch { /* Keep the original text and inspect it as source below. */ }
  }
  const fence = String.fromCharCode(96).repeat(3);
  if (source.startsWith(fence)) {
    const lines = source.split(/\r?\n/);
    lines.shift();
    if (lines.length && lines[lines.length - 1].trim() === fence) lines.pop();
    source = lines.join("\n").trim();
  }
  source = source.replace(/^\s*```(?:kotlin|kt|java)?\s*$/gim, "").replace(/^\s*```\s*$/gm, "").trim();
  // Remove a short natural-language preamble before the first Kotlin declaration.
  const sourceStart = source.search(/(?:^|\n)\s*(?:package\s+|import\s+|@(?:androidx\.compose\.runtime\.)?Composable|class\s+MainActivity\b)/m);
  if (sourceStart > 0) source = source.slice(sourceStart).trim();
  // Accept fully qualified Composable annotations as well as the short form.
  source = source.replace(/@androidx\.compose\.runtime\.Composable/g, "@Composable");
  // If the model omitted the annotation but returned a Compose screen, add it to the first screen function.
  if (!/@Composable\s+(?:(?:private|internal)\s+)?fun\s+[A-Za-z_]\w*\s*\(/m.test(source)) {
    const functionMatch = /(?:^|\n)(\s*(?:(?:private|internal)\s+)?fun\s+([A-Za-z_]\w*)\s*\()/m.exec(source);
    const hasComposeUi = /\b(?:Text|Button|OutlinedTextField|TextField|Column|Row|Box|Scaffold|LazyColumn|Card|Checkbox|Surface|CircularProgressIndicator)\s*\(/.test(source);
    if (functionMatch && hasComposeUi && !/class\s+MainActivity\s*:\s*ComponentActivity\s*\(/.test(source)) {
      const insertion = functionMatch.index + (functionMatch[0].startsWith("\n") ? 1 : 0);
      source = source.slice(0, insertion) + "@Composable\n" + source.slice(insertion);
    }
  }
  // Full Activity output is accepted as a compatibility fallback.
  if (/class\s+MainActivity\s*:\s*ComponentActivity\s*\(/.test(source) && /setContent\s*\{/.test(source)) {
    return { appName: "تطبيقي الجديد", packageName: "", summary: prompt.trim().replace(/\s+/g, " ").slice(0, 480), mainActivity: source };
  }
  const composable = /@Composable\s+(?:(?:private|internal)\s+)?fun\s+([A-Za-z_]\w*)\s*\(/m.exec(source);
  if (!composable) {
    const excerpt = source.replace(/\s+/g, " ").slice(0, 180);
    throw new Error("لم يرجع الذكاء الاصطناعي دالة Compose قابلة للاستخدام. بداية الاستجابة: " + (excerpt || "استجابة فارغة"));
  }
  const originalName = composable[1];
  if (originalName !== "GeneratedAppScreen") {
    const namePattern = new RegExp("\\bfun\\s+" + originalName + "\\s*\\(");
    source = source.replace(namePattern, "fun GeneratedAppScreen(");
  }
  source = source.replace(/^\s*package\s+[^\r\n]+\s*$/gm, "").trim();
  source = source.replace(/androidx\.compose\.ui\.text\.input\.KeyboardOptions/g, "androidx.compose.foundation.text.KeyboardOptions")
    .replace(/androidx\.compose\.ui\.text\.input\.KeyboardActions/g, "androidx.compose.foundation.text.KeyboardActions");
  return { appName: "تطبيقي الجديد", packageName: "", summary: prompt.trim().replace(/\s+/g, " ").slice(0, 480), mainActivity: source };
}
function validateGeneratedApp(app: GeneratedApp, expectedPackage: string): void {
  if (app.mainActivity.length > MAX_SOURCE_LENGTH) throw new Error("كود التطبيق الناتج أكبر من الحد المسموح.");
  let source = app.mainActivity.replace(/^\uFEFF/, "").trim();
  if (/\b(GROQ_API_KEY|GEMINI_API_KEY|GH_TOKEN|BUILD_TOKEN|ADMIN_PASSWORD)\b/.test(source)) throw new Error("تم رفض كود يحتوي على مؤشرات لمفاتيح أو أسرار.");
  const fullActivity = /class\s+MainActivity\s*:\s*ComponentActivity\s*\(/.test(source) && /setContent\s*\{/.test(source);
  if (fullActivity) {
    source = source.replace(/^\s*package\s+[^\r\n]+\s*$/gm, "").trim();
    const imports = source.split(/\r?\n/).filter(line => /^\s*import\s+/.test(line));
    const body = source.split(/\r?\n/).filter(line => !/^\s*import\s+/.test(line) && !/^\s*package\s+/.test(line)).join("\n").trim();
    const required = ["import android.os.Bundle", "import androidx.activity.ComponentActivity", "import androidx.activity.compose.setContent", "import androidx.compose.foundation.layout.fillMaxSize", "import androidx.compose.material3.MaterialTheme", "import androidx.compose.material3.Surface", "import androidx.compose.ui.Modifier"];
    app.mainActivity = "package " + expectedPackage + "\n\n" + Array.from(new Set(required.concat(imports))).join("\n") + "\n\n" + body;
  } else {
    if (!/@Composable\s+(?:(?:private|internal)\s+)?fun\s+GeneratedAppScreen\s*\(/m.test(source)) throw new Error("لم يتم العثور على واجهة Compose GeneratedAppScreen.");
    const imports = source.split(/\r?\n/).filter(line => /^\s*import\s+/.test(line));
    const body = source.split(/\r?\n/).filter(line => !/^\s*import\s+/.test(line) && !/^\s*package\s+/.test(line)).join("\n").trim();
    const required = ["import android.os.Bundle", "import androidx.activity.ComponentActivity", "import androidx.activity.compose.setContent", "import androidx.compose.foundation.layout.fillMaxSize", "import androidx.compose.material3.MaterialTheme", "import androidx.compose.material3.Surface", "import androidx.compose.runtime.Composable", "import androidx.compose.ui.Modifier"];
    const activity = ["class MainActivity : ComponentActivity() {", "    override fun onCreate(savedInstanceState: Bundle?) {", "        super.onCreate(savedInstanceState)", "        setContent {", "            MaterialTheme {", "                Surface(modifier = Modifier.fillMaxSize()) {", "                    GeneratedAppScreen()", "                }", "            }", "        }", "    }", "}"].join("\n");
    app.mainActivity = "package " + expectedPackage + "\n\n" + Array.from(new Set(required.concat(imports))).join("\n") + "\n\n" + activity + "\n\n" + body;
  }
  app.packageName = expectedPackage;
  if (!/class\s+MainActivity\s*:\s*ComponentActivity\s*\(/.test(app.mainActivity) || !/setContent\s*\{/.test(app.mainActivity)) throw new Error("تعذر إنشاء هيكل Android الأساسي.");
  app.appName = app.appName.replace(/[^\p{L}\p{N} ._-]/gu, "").trim().slice(0, 48) || "تطبيقي الجديد";
}
function systemPrompt(packageName: string): string {
  return [
    "You are an expert Android Jetpack Compose UI developer.",
    "Generate ONLY one concise Kotlin function named GeneratedAppScreen that creates the requested screen.",
    "Use this exact signature: @Composable fun GeneratedAppScreen() { ... }.",
    "Output raw Kotlin source only. No JSON, no Markdown fences, no explanations or preamble.",
    "Include additional imports only when necessary; the platform adds the Activity, package and standard imports.",
    "Use basic stable Compose Material 3 elements: Column, Row, Text, Button, OutlinedTextField, Checkbox, Card and LazyColumn.",
    "You may use KeyboardOptions or KeyboardActions when useful. KeyboardOptions and KeyboardActions belong to androidx.compose.foundation.text; KeyboardType belongs to androidx.compose.ui.text.input. Never qualify KeyboardOptions or KeyboardActions with androidx.compose.ui.text.input.",
    "Implement real local UI state with remember and mutableStateOf. Keep the screen compact and focused on the user's requested features.",
    "Use Arabic labels for Arabic prompts and organize the UI for right-to-left reading.",
    "Do not include secrets, API keys, passwords or tokens.",
    "The package is assigned by the platform; do not output a package declaration: " + packageName
  ].join("\n");
}
async function reserveDevice(db: D1Database, deviceId: string, limit: number): Promise<boolean> {
  const result = await db.prepare(
    "INSERT INTO device_usage (usage_day, device_id, generations) VALUES (?, ?, 1) " +
    "ON CONFLICT(usage_day, device_id) DO UPDATE SET generations = generations + 1 WHERE generations < ? RETURNING generations"
  ).bind(today(), deviceId, limit).first<{ generations: number }>();
  return result !== null;
}
async function releaseDeviceReservation(db: D1Database, deviceId: string): Promise<void> {
  await db.prepare("UPDATE device_usage SET generations = CASE WHEN generations > 0 THEN generations - 1 ELSE 0 END WHERE usage_day = ? AND device_id = ?")
    .bind(today(), deviceId).run();
}
async function reserveProvider(db: D1Database, provider: Provider, limit: number): Promise<boolean> {
  const result = await db.prepare(
    "INSERT INTO provider_usage (usage_day, provider, requests) VALUES (?, ?, 1) " +
    "ON CONFLICT(usage_day, provider) DO UPDATE SET requests = requests + 1 WHERE requests < ? RETURNING requests"
  ).bind(today(), provider, limit).first<{ requests: number }>();
  return result !== null;
}
async function releaseProviderReservation(db: D1Database, provider: Provider): Promise<void> {
  await db.prepare("UPDATE provider_usage SET requests = CASE WHEN requests > 0 THEN requests - 1 ELSE 0 END WHERE usage_day = ? AND provider = ?")
    .bind(today(), provider).run();
}
async function recordTokens(db: D1Database, provider: Provider, inputTokens: number, outputTokens: number): Promise<void> {
  await db.prepare("UPDATE provider_usage SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ? WHERE usage_day = ? AND provider = ?")
    .bind(Math.max(0, inputTokens), Math.max(0, outputTokens), today(), provider).run();
}
async function callGroq(env: Env, prompt: string, packageName: string): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  if (!env.GROQ_API_KEY) throw new Error("مفتاح Groq غير مضبوط.");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: "Bearer " + env.GROQ_API_KEY, "content-type": "application/json" },
    signal: AbortSignal.timeout(80000),
    body: JSON.stringify({
      model: env.GROQ_MODEL || "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: systemPrompt(packageName) },
        { role: "user", content: "Build this Android app:\n" + prompt + "\n\nReturn only the complete Kotlin source file. No JSON, no Markdown." }
      ],
      temperature: 0.1,
      reasoning_effort: "low",
      include_reasoning: false,
      max_completion_tokens: 4096
    })
  });
  const raw = await response.text();
  let payload: {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string; failed_generation?: unknown };
  } = {};
  try { payload = JSON.parse(raw) as typeof payload; }
  catch { throw new Error("استجابة Groq غير مفهومة (HTTP " + response.status + ")."); }
  if (!response.ok) {
    const detail = payload.error?.failed_generation;
    const failed = detail ? ": " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 180) : "";
    throw new Error("Groq: " + (payload.error?.message || "HTTP " + response.status).slice(0, 180) + failed);
  }
  const text = payload.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq لم يرجع كود Kotlin.");
  return { text, inputTokens: payload.usage?.prompt_tokens || 0, outputTokens: payload.usage?.completion_tokens || 0 };
}
async function callGemini(env: Env, prompt: string, packageName: string): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  if (!env.GEMINI_API_KEY) throw new Error("مفتاح Gemini غير مضبوط.");
  const model = env.GEMINI_MODEL || "gemini-3.8-flash";
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    signal: AbortSignal.timeout(55000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt(packageName) }] },
      contents: [{ role: "user", parts: [{ text: "Build this Android app:\n" + prompt + "\n\nReturn only the complete Kotlin source file. No JSON, no Markdown." }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingLevel: "low" }
      }
    })
  });
  const raw = await response.text();
  let payload: {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    error?: { message?: string };
  } = {};
  try { payload = JSON.parse(raw) as typeof payload; }
  catch {
    if (response.status === 524 || response.status === 504) throw new Error("Gemini تأخر في الرد. أعد المحاولة بعد قليل.");
    throw new Error("أعاد Gemini استجابة غير صالحة (HTTP " + response.status + ").");
  }
  if (!response.ok) {
    const code = response.status;
    if (code === 429) throw new Error("وصل Gemini إلى حد الطلبات المؤقت. انتظر قليلاً ثم أعد المحاولة.");
    if (code === 503 || code === 504 || code === 524) throw new Error("خدمة Gemini مشغولة حالياً أو تأخرت في الرد. أعد المحاولة بعد قليل.");
    throw new Error("Gemini: " + (payload.error?.message || "HTTP " + code).slice(0, 200));
  }
  const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("");
  if (!text) throw new Error("Gemini لم يرجع كود Kotlin.");
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
      const app = parseModelSource(result.text, prompt);
      validateGeneratedApp(app, packageName);
      await recordTokens(env.DB, provider, result.inputTokens, result.outputTokens);
      return { app, provider };
    } catch (error) {
      await releaseProviderReservation(env.DB, provider).catch(() => undefined);
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
    await releaseDeviceReservation(env.DB, deviceId).catch(() => undefined);
    const message = error instanceof Error ? error.message : "حدث خطأ أثناء التوليد.";
    return json({ error: message + " لم يتم احتساب المحاولة من حصتك اليومية." }, 502);
  }
}
async function handleProject(request: Request, env: Env, id: string): Promise<Response> {
  const deviceId = new URL(request.url).searchParams.get("device_id");
  if (!validDeviceId(deviceId)) return json({ error: "معرّف الجهاز مفقود." }, 400);
  const p = await env.DB.prepare("SELECT id, app_name, creator_name, summary, provider, status, error_message, created_at, apk_url, report_url FROM projects WHERE id = ? AND device_id = ?")
    .bind(id, deviceId).first<{ id: string; app_name: string; creator_name: string; summary: string; provider: string; status: string; error_message: string | null; created_at: string; apk_url: string | null; report_url: string | null }>();
  if (!p) return json({ error: "المشروع غير موجود." }, 404);
  return json({
    projectId: p.id, appName: p.app_name, creatorName: p.creator_name, summary: p.summary, provider: p.provider, status: p.status,
    error: p.error_message, createdAt: p.created_at, downloadUrl: p.apk_url, reportUrl: p.report_url
  });
}
async function handleUsage(request: Request, env: Env): Promise<Response> {
  const deviceId = new URL(request.url).searchParams.get("device_id");
  if (!validDeviceId(deviceId)) return json({ error: "معرّف الجهاز مفقود." }, 400);
  const device = await env.DB.prepare("SELECT generations FROM device_usage WHERE usage_day = ? AND device_id = ?")
    .bind(today(), deviceId).first<{ generations: number }>();
  const providers = await env.DB.prepare("SELECT provider, requests, input_tokens, output_tokens FROM provider_usage WHERE usage_day = ?").bind(today()).all();
  return json({ date: today(), device: { used: device?.generations || 0, limit: readLimit(env.DEVICE_DAILY_LIMIT, 2) }, platformProviders: providers.results || [] });
}
async function tokenMatches(request: Request, expected: string | undefined): Promise<boolean> {
  const supplied = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || !supplied || supplied.length !== expected.length) return false;
  const a = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(supplied)));
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(expected)));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function isBuildAuthorized(request: Request, env: Env): Promise<boolean> {
  return tokenMatches(request, env.BUILD_TOKEN);
}
async function isAdminAuthorized(request: Request, env: Env): Promise<boolean> {
  return tokenMatches(request, env.ADMIN_PASSWORD);
}
async function adminLogin(request: Request, env: Env): Promise<Response> {
  if (!env.ADMIN_PASSWORD) return json({ error: "لم يتم إعداد كلمة مرور لوحة المعلم بعد." }, 503);
  if (!(await tokenMatches(request, env.ADMIN_PASSWORD))) return json({ error: "كلمة المرور غير صحيحة." }, 401);
  return json({ ok: true });
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
async function dispatchDeleteRelease(env: Env, projectId: string): Promise<void> {
  if (!env.GH_TOKEN) throw new Error("مفتاح GitHub غير مضبوط على الخادم.");
  const repo = env.GITHUB_REPOSITORY || "ibms2000-gif/apkappbuilder";
  const ref = env.GITHUB_REF || "main";
  const response = await fetch("https://api.github.com/repos/" + repo + "/actions/workflows/delete-app-release.yml/dispatches", {
    method: "POST",
    headers: {
      authorization: "Bearer " + env.GH_TOKEN,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "apkappbuilder-admin"
    },
    body: JSON.stringify({ ref, inputs: { project_id: projectId } })
  });
  if (!response.ok) throw new Error("تعذر بدء حذف التطبيق من GitHub (HTTP " + response.status + ").");
}
async function adminListProjects(request: Request, env: Env): Promise<Response> {
  if (!(await isAdminAuthorized(request, env))) return json({ error: "رمز لوحة المعلم غير صحيح." }, 401);
  const rows = await env.DB.prepare(
    "SELECT id, app_name, creator_name, prompt, summary, provider, status, error_message, created_at, release_url, apk_url, report_url FROM projects ORDER BY created_at DESC LIMIT 500"
  ).all();
  return json({ projects: rows.results || [] });
}
async function adminDeleteProject(request: Request, env: Env, id: string): Promise<Response> {
  if (!(await isAdminAuthorized(request, env))) return json({ error: "رمز لوحة المعلم غير صحيح." }, 401);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "معرّف المشروع غير صالح." }, 400);
  const p = await env.DB.prepare("SELECT id, status FROM projects WHERE id = ?")
    .bind(id).first<{ id: string; status: string }>();
  if (!p) return json({ error: "المشروع غير موجود أو سبق حذفه." }, 404);
  if (p.status === "deleting") return json({ ok: true, status: "deleting", message: "الحذف جارٍ بالفعل." }, 202);
  await env.DB.prepare("UPDATE projects SET status = 'deleting', error_message = NULL, updated_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), id).run();
  try {
    await dispatchDeleteRelease(env, id);
    return json({ ok: true, status: "deleting", message: "بدأ حذف التطبيق وملفاته العامة." }, 202);
  } catch (error) {
    await env.DB.prepare("UPDATE projects SET status = ?, error_message = ?, updated_at = ? WHERE id = ?")
      .bind(p.status, error instanceof Error ? error.message : "تعذر بدء الحذف.", new Date().toISOString(), id).run();
    throw error;
  }
}
async function buildDeleted(request: Request, env: Env): Promise<Response> {
  if (!(await isBuildAuthorized(request, env))) return json({ error: "غير مصرح." }, 401);
  const body = await request.json() as { project_id?: string };
  if (!body.project_id || !/^[0-9a-f-]{36}$/i.test(body.project_id)) return json({ error: "معرّف المشروع غير صالح." }, 400);
  await env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(body.project_id).run();
  return json({ ok: true, deleted: true });
}
async function buildDeletionFailure(request: Request, env: Env): Promise<Response> {
  if (!(await isBuildAuthorized(request, env))) return json({ error: "غير مصرح." }, 401);
  const body = await request.json() as { project_id?: string; error?: string };
  if (!body.project_id) return json({ error: "معرّف المشروع مفقود." }, 400);
  await env.DB.prepare("UPDATE projects SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?")
    .bind((body.error || "تعذر حذف الإصدار من GitHub.").slice(0, 1000), new Date().toISOString(), body.project_id).run();
  return json({ ok: true });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (env.ADMIN_TOKEN && url.pathname === "/control/" + env.ADMIN_TOKEN && request.method === "GET") {
      const page = await env.ASSETS.fetch(new Request(new URL("/admin.html", url.origin), request));
      const headers = new Headers(page.headers);
      headers.set("cache-control", "no-store, max-age=0");
      headers.set("referrer-policy", "no-referrer");
      headers.set("x-robots-tag", "noindex, nofollow, noarchive");
      return new Response(page.body, { status: page.status, statusText: page.statusText, headers });
    }
    if (url.pathname === "/admin.html") return new Response("Not Found", { status: 404 });
    if (url.pathname.startsWith("/api/")) {
      try {
        if (request.method === "POST" && url.pathname === "/api/generate") {
          return await handleGenerate(request, env);
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
        if (request.method === "POST" && url.pathname === "/api/build/deleted") {
          return await buildDeleted(request, env);
        }
        if (request.method === "POST" && url.pathname === "/api/build/deletion-failed") {
          return await buildDeletionFailure(request, env);
        }
        if (request.method === "POST" && url.pathname === "/api/admin/login") {
          return await adminLogin(request, env);
        }
        if (request.method === "GET" && url.pathname === "/api/admin/projects") {
          return await adminListProjects(request, env);
        }
        const adminDeleteMatch = url.pathname.match(/^\/api\/admin\/projects\/([0-9a-f-]{36})$/i);
        if (request.method === "DELETE" && adminDeleteMatch) {
          return await adminDeleteProject(request, env, adminDeleteMatch[1]);
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
