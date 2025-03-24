import { json } from "@remix-run/node";

// Simple resource route that always returns 401 for testing
export function action() {
  return new Response(
    JSON.stringify({ error: "Unauthorized" }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}

export function loader() {
  return new Response(
    JSON.stringify({ error: "Unauthorized" }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
} 