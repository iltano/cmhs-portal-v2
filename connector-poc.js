/* Read-only proof of concept for the locally installed CAIS connector. */
(function (global) {
  'use strict';
  const endpoint = 'http://127.0.0.1:8765/api/cais/soap';
  const queryPayload = `<output_getquerydata>
<queries>
<query>
<statement>select runningXMLValue cmhsConfig from csmsSetting where settingPath = 'CMHS\\Network\\' and settingname='configuration'</statement>
<parameters>
<parameter name="noneyet">123</parameter>
</parameters>
</query>
</queries>
</output_getquerydata>`;

  const parse = text => {
    const doc = new DOMParser().parseFromString(String(text || '').replace(/^\uFEFF/, ''), 'application/xml');
    const error = doc.getElementsByTagName('parsererror')[0];
    if (error) throw new Error('Connector returned invalid XML: ' + error.textContent.slice(0, 180));
    return doc;
  };
  const cdata = text => String(text).replace(/]]>/g, ']]]]><![CDATA[>');
  function soapRequest() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:cais="http://www.ortec.com/CAIS">
  <soap:Header xmlns:a="http://www.w3.org/2005/08/addressing"><a:Action>http://www.ortec.com/CAIS/IApplicationIntegrationService/SendMessage</a:Action></soap:Header>
  <soap:Body><cais:SendMessage><cais:message><![CDATA[${cdata(queryPayload)}]]></cais:message><cais:commandName>CMHS</cais:commandName></cais:SendMessage></soap:Body>
</soap:Envelope>`;
  }
  function configurationFromResponse(responseXML) {
    const documents = [parse(responseXML)];
    // CAIS commonly returns the decorator output as escaped or CDATA XML in
    // its SOAP result. Parse that nested result before searching its columns.
    [...documents[0].getElementsByTagName('*')].forEach(element => {
      const text = element.textContent.trim();
      if (text.startsWith('<output_getquerydata')) {
        try { documents.push(parse(text)); } catch { /* Keep the original SOAP diagnostic. */ }
      }
    });
    for (const doc of documents) {
      const column = [...doc.getElementsByTagName('*')].find(element =>
        element.localName === 'column' && String(element.getAttribute('name') || '').toLowerCase() === 'cmhsconfig'
      );
      if (!column) continue;
      const nestedConfiguration = [...column.children].find(element => element.localName === 'messagehub');
      const configuration = nestedConfiguration ? new XMLSerializer().serializeToString(nestedConfiguration) : column.textContent.trim();
      if (!configuration) throw new Error('The connector response contains cmhsConfig, but it is empty.');
      const configDocument = parse(configuration);
      if (configDocument.documentElement.localName !== 'messagehub') throw new Error('cmhsConfig is not a Message Hub configuration (.mhc) XML document.');
      return configuration;
    }
    throw new Error('The connector response does not contain queryResults/record/column name="cmhsConfig".');
  }
  async function loadConfiguration() {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/soap+xml;charset=UTF-8'},
      body: soapRequest()
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`Connector returned HTTP ${response.status}: ${body.slice(0, 300)}`);
    return configurationFromResponse(body);
  }
  global.CMHS_CONNECTOR_POC = { endpoint, queryPayload, soapRequest, configurationFromResponse, loadConfiguration };
})(window);
