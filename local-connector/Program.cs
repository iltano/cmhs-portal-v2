using System.Net.Http.Headers;
using System.Net;
using System.Text;

// Keep the executable and its configuration portable as one folder. This
// avoids resolving appsettings.json from whichever directory launched the EXE.
var applicationDirectory = AppContext.BaseDirectory;
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = applicationDirectory
});
builder.Configuration.AddJsonFile(Path.Combine(applicationDirectory, "appsettings.json"), optional: true, reloadOnChange: true);

var connector = builder.Configuration.GetSection("Connector");
var allowedOrigin = connector["AllowedOrigin"] ?? "https://cmhs.integration-lab.workers.dev";
var caisUrl = connector["CaisUrl"];
var port = connector.GetValue("Port", 8765);

if (!Uri.TryCreate(caisUrl, UriKind.Absolute, out var caisEndpoint))
{
    throw new InvalidOperationException("Connector:CaisUrl must be an absolute URL in appsettings.json.");
}

var loopbackCais = string.Equals(caisEndpoint.Host, "localhost", StringComparison.OrdinalIgnoreCase)
    || (IPAddress.TryParse(caisEndpoint.Host, out var caisAddress) && IPAddress.IsLoopback(caisAddress));
if (caisEndpoint.Scheme != Uri.UriSchemeHttps && !(caisEndpoint.Scheme == Uri.UriSchemeHttp && loopbackCais))
{
    throw new InvalidOperationException("Connector:CaisUrl must use HTTPS, except for a loopback HTTP CAIS endpoint.");
}

builder.WebHost.UseUrls($"http://127.0.0.1:{port}");
builder.Services.AddHttpClient("cais", client =>
{
    client.Timeout = TimeSpan.FromSeconds(60);
});

var app = builder.Build();

// The portal is served from Cloudflare. The connector is intentionally the
// CORS boundary: CAIS itself never needs to permit browser-origin requests.
app.Use(async (context, next) =>
{
    var origin = context.Request.Headers.Origin.ToString();
    if (string.Equals(origin, allowedOrigin, StringComparison.Ordinal))
    {
        context.Response.Headers.AccessControlAllowOrigin = allowedOrigin;
        context.Response.Headers.Append("Vary", "Origin");

        if (HttpMethods.IsOptions(context.Request.Method))
        {
            context.Response.Headers.AccessControlAllowMethods = "GET, POST, OPTIONS";
            context.Response.Headers.AccessControlAllowHeaders = "Content-Type, Authorization";
            context.Response.Headers.AccessControlMaxAge = "600";

            // Chromium may send this preflight when a public HTTPS page calls
            // a loopback service. It is harmless for a loopback-only listener.
            if (context.Request.Headers.ContainsKey("Access-Control-Request-Private-Network"))
            {
                context.Response.Headers.Append("Access-Control-Allow-Private-Network", "true");
            }

            context.Response.StatusCode = StatusCodes.Status204NoContent;
            return;
        }
    }

    await next();
});

app.MapGet("/health", () => Results.Json(new
{
    status = "ready",
    allowedOrigin,
    endpoint = caisEndpoint.Host
}));

app.MapPost("/api/cais/soap", async (HttpContext context, IHttpClientFactory clients, CancellationToken cancellationToken) =>
{
    if (context.Request.ContentLength is > 2_000_000)
    {
        return Results.BadRequest(new { error = "SOAP payload exceeds the 2 MB connector limit." });
    }

    var authorization = context.Request.Headers.Authorization.ToString();

    using var reader = new StreamReader(context.Request.Body, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, leaveOpen: false);
    var soap = await reader.ReadToEndAsync(cancellationToken);
    if (string.IsNullOrWhiteSpace(soap))
    {
        return Results.BadRequest(new { error = "SOAP payload is empty." });
    }

    using var request = new HttpRequestMessage(HttpMethod.Post, caisEndpoint)
    {
        Content = new StringContent(soap, Encoding.UTF8, "application/soap+xml")
    };
    if (!string.IsNullOrWhiteSpace(authorization))
    {
        request.Headers.Authorization = AuthenticationHeaderValue.Parse(authorization);
    }

    using var response = await clients.CreateClient("cais").SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
    context.Response.StatusCode = (int)response.StatusCode;
    context.Response.ContentType = response.Content.Headers.ContentType?.ToString() ?? "application/xml";
    await response.Content.CopyToAsync(context.Response.Body, cancellationToken);
    return Results.Empty;
});

app.Run();
