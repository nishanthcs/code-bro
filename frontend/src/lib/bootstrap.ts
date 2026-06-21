function metaContent(name: string): string {
  return (
    document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ""
  );
}

const token = metaContent("codebro-api-token");
const executionOrigin = metaContent("codebro-execution-origin");

export const bootstrap = {
  apiToken:
    token && !token.startsWith("__CODEBRO_") ? token : "dev-token",
  executionOrigin:
    executionOrigin && !executionOrigin.startsWith("__CODEBRO_")
      ? executionOrigin
      : "http://127.0.0.1:8766",
};

