/* Read-only client for the locally installed CAIS/OIR connector. */
(function (global) {
  'use strict';

  // The loopback connector owns the CAIS endpoint and CORS policy. Keeping the
  // browser pointed at one fixed, local URL prevents this page becoming a proxy.
  const endpoint = 'http://127.0.0.1:8765/api/cais/soap';
  const queryPayload = `<decorator>
  <output_getquerydata>
    <queries>
      <query name="CMHS/Getquery">
        <parameters>
          <parameter name="inputQuery">select runningXMLValue cmhsConfig from csmsSetting where settingPath ~ 'CMHS\\Network\\' and settingname~'configuration'</parameter>
        </parameters>
      </query>
    </queries>
  </output_getquerydata>
</decorator>`;

  const elements = document => [...document.getElementsByTagName('*')];
  const local = element => element.localName || element.nodeName.split(':').pop();
  const cdata = text => String(text).replace(/]]>/g, ']]]]><![CDATA[>');

  function parse(text, context = 'Connector response') {
    const doc = new DOMParser().parseFromString(String(text || '').replace(/^\uFEFF/, ''), 'application/xml');
    const error = doc.getElementsByTagName('parsererror')[0];
    if (error) throw new Error(`${context} is not valid XML: ${error.textContent.trim().slice(0, 240)}`);
    return doc;
  }

  function soapRequest() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:cais="http://www.ortec.com/CAIS">
  <soap:Header xmlns:a="http://www.w3.org/2005/08/addressing">
    <a:Action>http://www.ortec.com/CAIS/IApplicationIntegrationService/SendMessage</a:Action>
  </soap:Header>
  <soap:Body>
    <cais:SendMessage>
      <cais:message><![CDATA[${cdata(queryPayload)}]]></cais:message>
      <cais:commandName>CMHS</cais:commandName>
    </cais:SendMessage>
  </soap:Body>
</soap:Envelope>`;
  }

  function faultMessage(document) {
    const fault = elements(document).find(element => local(element) === 'Fault');
    if (!fault) return '';
    const reason = elements(fault).find(element => local(element) === 'Text') || fault;
    return reason.textContent.trim() || 'CAIS returned a SOAP fault.';
  }

  // CAIS returns SendMessageResult as escaped XML. The cmhsConfig column is
  // escaped once more, so parse each XML layer rather than decoding entities by
  // hand (which would corrupt valid configuration values containing '&').
  function responseDocuments(responseXML) {
    const documents = [parse(responseXML)];
    for (let index = 0; index < documents.length && index < 8; index++) {
      const fault = faultMessage(documents[index]);
      if (fault) throw new Error(`CAIS SOAP fault: ${fault}`);
      elements(documents[index]).forEach(element => {
        const value = element.textContent.trim();
        if (!value.startsWith('<')) return;
        try { documents.push(parse(value, 'Nested CAIS result')); } catch { /* Not every XML-looking value is a complete document. */ }
      });
    }
    return documents;
  }

  function queryError(documents) {
    for (const document of documents) {
      const errors = elements(document).find(element => local(element) === 'queryErrors');
      if (!errors || (!errors.children.length && !errors.textContent.trim())) continue;
      return errors.textContent.trim() || new XMLSerializer().serializeToString(errors).slice(0, 500);
    }
    return '';
  }

  function configurationFromResponse(responseXML) {
    const documents = responseDocuments(responseXML);
    const error = queryError(documents);
    if (error) throw new Error(`CMHS/Getquery failed: ${error}`);
    for (const document of documents) {
      const column = elements(document).find(element =>
        local(element) === 'column' && String(element.getAttribute('name') || '').toLowerCase() === 'cmhsconfig'
      );
      if (!column) continue;
      const embedded = [...column.children].find(element => local(element) === 'messagehub');
      const configuration = embedded ? new XMLSerializer().serializeToString(embedded) : column.textContent.trim();
      if (!configuration) throw new Error('CMHS/Getquery returned cmhsConfig, but it is empty.');
      const configDocument = parse(configuration, 'cmhsConfig');
      if (local(configDocument.documentElement) !== 'messagehub') throw new Error('CMHS/Getquery returned cmhsConfig, but it is not a Message Hub configuration (.mhc) document.');
      return configuration;
    }
    throw new Error('CMHS/Getquery completed, but its response contains no queryResults/record/column named cmhsConfig.');
  }

  async function loadConfiguration() {
    let response;
    try {
      response = await fetch(endpoint, {method: 'POST', headers: {'Content-Type': 'application/soap+xml;charset=UTF-8'}, body: soapRequest()});
    } catch (error) {
      throw new Error(`Cannot reach the local OIR connector at ${endpoint}. Start the connector and confirm that this portal origin is allowed. (${error.message})`);
    }
    const body = await response.text();
    if (!response.ok) throw new Error(`Connector returned HTTP ${response.status}: ${body.slice(0, 500)}`);
    return configurationFromResponse(body);
  }

  global.CMHS_CONNECTOR_POC = {endpoint, queryPayload, soapRequest, configurationFromResponse, loadConfiguration};
})(window);
