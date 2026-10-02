# CMHS Portal local CAIS connector

This small .NET service lets the Cloudflare-hosted CMHS Portal call CAIS through a connector running on the same computer as the browser. It listens only on `127.0.0.1`; it exposes no network port.

The connector allows calls only from `https://cmhs.integration-lab.workers.dev`, handles browser CORS and private-network preflights, and forwards a SOAP request to one configured CAIS endpoint. It permits HTTP only for a loopback CAIS endpoint such as `http://localhost:8000`; all remote CAIS endpoints must use HTTPS.

## Configure and run

1. Install the .NET 8 runtime, or publish the project as a self-contained Windows executable.
2. Copy `appsettings.example.json` to `appsettings.json`.
3. Set `Connector:CaisUrl` to the local CAIS endpoint, for example `http://localhost:8000/CAIS/ApplicationIntegration/YOUR_ENVIRONMENT`.
4. Run:

   ```powershell
   dotnet run
   ```

   The health endpoint is `http://127.0.0.1:8765/health`.

## Portal request

The portal will call `POST http://127.0.0.1:8765/api/cais/soap` with:

- `Content-Type: application/soap+xml;charset=UTF-8`
- The SOAP XML request body

No credentials are required for a local CAIS endpoint. For an external HTTPS CAIS endpoint, an optional in-memory `Authorization: Basic ...` header can be forwarded without being stored. The connector fixes the CAIS target URL in its local configuration; it is not a general proxy.

## Publish for Windows

From a computer with the .NET SDK:

```powershell
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o publish
```

Copy `appsettings.json` next to `CmhsPortalConnector.exe`, then start the executable. The connector always reads the configuration beside its executable, regardless of the PowerShell working directory. The CAIS request leaves from the connector computer's existing network address, which is suitable for IP allowlisting.
