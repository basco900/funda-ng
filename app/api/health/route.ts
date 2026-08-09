export function GET() {
  return Response.json(
    {
      status: "ok",
      service: "funda-web",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
