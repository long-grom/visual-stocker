import { json } from "@remix-run/node";

// No UI component export - this is a resource route

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