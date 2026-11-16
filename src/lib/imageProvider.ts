import "server-only";
import { generateImage as generateArkImage, isArkConfigured } from "./modelark";
import { generateImage as generateOpenRouterImage, isConfigured } from "./openrouter";

/** The generate function for an image model id, or the 501 to return when its provider key is missing. */
export function imageProvider(model: string): typeof generateOpenRouterImage | Response {
  const ark = model.startsWith("modelark/");
  if (ark ? !isArkConfigured() : !isConfigured()) {
    return Response.json(
      { error: `${ark ? "ARK_API_KEY" : "OPENROUTER_API_KEY"} is not configured on the server.` },
      { status: 501 }
    );
  }
  return ark ? generateArkImage : generateOpenRouterImage;
}
