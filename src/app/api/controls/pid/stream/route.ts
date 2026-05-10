import { getPidOutputs } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const stream = new ReadableStream({
    start(controller) {
      // Send initial data immediately
      try {
        const initialData = getPidOutputs();
        controller.enqueue(`data: ${JSON.stringify(initialData)}\n\n`);
      } catch (err) {
        console.error("Error sending initial SSE data:", err);
      }

      // Send updates every 2 seconds
      const interval = setInterval(() => {
        try {
          const data = getPidOutputs();
          controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
        } catch (err) {
          console.error("Error sending SSE data:", err);
        }
      }, 2000);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
      });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
