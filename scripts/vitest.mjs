// Lanza Vitest con el directorio de trabajo normalizado.
// En Windows, npm ejecuta los scripts con la unidad tal como se abrió el proyecto («c:\…» en
// minúscula si viene de VS Code). Con eso Vitest 5 carga sus módulos dos veces y TODOS los tests
// fallan con «Cannot read properties of undefined (reading 'config')». Con «C:\…» funciona.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const upperDrive = (p) => p.replace(/^[a-z]:/, (d) => d.toUpperCase());
const cwd = upperDrive(process.cwd());
const bin = upperDrive(fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url)));
const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { cwd, stdio: "inherit" });
process.exit(result.status ?? 1);
