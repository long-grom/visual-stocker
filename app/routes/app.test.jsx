import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { Button } from "@shopify/polaris";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return json({ message: "It works!" });
};

export default function TestPage() {
  return (
    <div style={{ padding: "20px" }}>
      <h1>Test Page</h1>
      <p>This is a simple test page with a single Polaris component.</p>
      <div style={{ marginTop: "20px" }}>
        <Button>Polaris Button</Button>
      </div>
    </div>
  );
} 