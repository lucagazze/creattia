const client_id = process.env.TIENDANUBE_CLIENT_ID || '';
const client_secret = process.env.TIENDANUBE_CLIENT_SECRET || '';

console.log("Client ID Length:", client_id.length, "Value:", JSON.stringify(client_id));
console.log("Client Secret Length:", client_secret.length, "Value:", JSON.stringify(client_secret));
