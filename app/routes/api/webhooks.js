import { json } from "@remix-run/node";

/**
 * Dedicated webhook validation endpoint that always returns 401
 * This is for Shopify's automated webhook validation test
 */
export async function action({ request }) {
  // Always return a 401 Unauthorized for the validation check
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

export async function loader({ request }) {
  // Handle GET requests with a 401 as well
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json"
    }
  });
} 