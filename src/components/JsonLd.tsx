export function JsonLd({ data }: { data: Record<string, unknown> }) {
  // Replace </script> to prevent XSS if data ever contains user input
  const safeJson = JSON.stringify(data).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJson }}
    />
  );
}
