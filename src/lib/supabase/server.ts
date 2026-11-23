// Punto de entrada del cliente secreto para la app de Next.
// `server-only` hace fallar el build si algún componente de cliente lo importa.
import "server-only";

export { createAdminClient as createServerClient, type AdminClient as ServerClient } from "./admin";
