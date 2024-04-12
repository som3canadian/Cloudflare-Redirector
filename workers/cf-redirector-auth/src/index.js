import { sign } from '@tsndr/cloudflare-worker-jwt'
const encoder = new TextEncoder();

addEventListener('fetch', event => {
    event.respondWith(handleAuthRequest(event.request));
});

async function handleAuthRequest(request, env) {
    const headerValue = request.headers.get(AUTH_HEADER_KEY);
		if (!headerValue) {
			return unauthorizedResponse();
		}
		const timing_result = timingSafeCheck(headerValue, AUTH_HEADER_SECRET);
		if (!timing_result) {
			return unauthorizedResponse();
		}
		const token = await sign({ data: 'authorized' }, JWT_SECRET, { expiresIn: '1h' });
		return new Response(JSON.stringify({ token }), { status: 200 });
}

// https://developers.cloudflare.com/workers/examples/protect-against-timing-attacks
function timingSafeCheck(headerValue, AUTH_HEADER_SECRET) {
	const a = encoder.encode(headerValue);
  const b = encoder.encode(AUTH_HEADER_SECRET);
  if (a.byteLength !== b.byteLength) {
    // compare byte length of the two strings.
    return false;
  }
  // compare if the two strings are equal
	let isEqual = crypto.subtle.timingSafeEqual(a, b);
	if (!isEqual) {
		return false;
	}
	return true;
}

function unauthorizedResponse() {
  return new Response(JSON.stringify({ "Error": "Unauthorized" }, null, 2), {
    status: 401,
    headers: { "content-type": "application/json;charset=UTF-8" }
  });
}
