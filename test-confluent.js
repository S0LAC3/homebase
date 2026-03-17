const apiKey = 'YKEGYMSSPDLCB4DW';
const apiSecret = 'cfltpFHW2IOlt8iuiLuLl96gTCBRND3M+zShICiM8J02DFlP33hII7cUNiJtxekQ';
const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
console.log('Auth header:', `Basic ${auth}`);
console.log('Auth decoded check:', Buffer.from(auth, 'base64').toString());

fetch('https://psrc-z27ovke.us-east1.gcp.confluent.cloud/kafka/v3/clusters', {
  headers: {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json'
  }
}).then(r => {
  console.log('Status:', r.status);
  return r.text();
}).then(d => console.log('Response:', d)).catch(e => console.error('Error:', e));
