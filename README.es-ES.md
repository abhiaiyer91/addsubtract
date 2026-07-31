

<div align="center">

# wit

**Git que entiende tu código.**

Una implementación de Git con IA integrada en el flujo de trabajo, no añadida a posteriori.

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.13.0-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Sitio web](https://wit.sh) | [Documentación](https://docs.wit.sh) | [Inicio rápido](https://docs.wit.sh/quickstart) | [Hoja de ruta](./ROADMAP.md)

</div>

---

## ¿Qué es wit?

wit es una reimplementación completa de Git en TypeScript con capacidades de IA integradas en su núcleo. No es un envoltorio alrededor de Git, es una nueva perspectiva del control de versiones que entiende tu código, no solo tus archivos.

```bash
$ wit search "where do we handle authentication?"

  src/core/auth.ts:45-89 (94% match)
  SessionManager.createSession()
  │ 45 │ async createSession(userId: string) {
  │ 46 │   const token = crypto.randomBytes(32)...
```

## ¿Por qué wit?

| Problema | Git | wit |
|---------|-----|-----|
| Deshacer un error | `git reflog` + rezar | `wit undo` |
| Escribir mensaje de commit | Tú lo haces | `wit ai commit` lo hace por ti |
| Buscar código por intención | `grep` todo | `wit search "how does X work?"` |
| Errores útiles | `fatal: bad revision` | Explica qué salió mal + sugiere una solución |
| Rama con cambios sin confirmar | Stash, switch, pop, llorar | Solo cambia de rama. wit se encarga. |

## Inicio rápido

```bash
# Instalar
git clone https://github.com/abhiaiyer91/wit.git && cd wit
npm install && npm run build && npm link

# Empezar a usarlo
wit init my-project && cd my-project
wit add . && wit commit -m "initial commit"

# Deja que la IA te ayude
wit ai commit -a -x              # La IA escribe el mensaje de commit
wit search "where is auth?"      # Búsqueda semántica, no grep
wit ai review                    # La IA revisa tus cambios
```

## Características

### Flujo de trabajo nativo de IA

```bash
wit ai commit -a -x      # La IA analiza los cambios y escribe el mensaje
wit ai review            # Obtén una revisión de código con IA antes de push
wit ai explain HEAD~3..  # Explica qué ocurrió en los commits recientes
wit search "error handling for API calls"  # Búsqueda semántica
```

### Comandos de Productividad

```bash
wit undo                 # Deshaz realmente lo último (basado en journal)
wit wip -a               # Guardado rápido con mensaje autogenerado
wit amend -m "fix typo"  # Modifica el último commit fácilmente
wit uncommit             # Deshaz el commit pero mantén los cambios en staged
wit cleanup              # Elimina ramas fusionadas
```

### Interfaces Visuales

```bash
wit web                  # Interfaz web para tu repo (como GitKraken)
wit ui                   # Interfaz de terminal (controlada por teclado)
wit graph                # Gráfico de commits en terminal
```

### Compatibilidad Total con Git

wit implementa Git desde cero pero mantiene la compatibilidad:

- Push/pull a GitHub, GitLab, Bitbucket
- 66 comandos que cubren el flujo de trabajo completo de Git
- Funciona con repositorios Git existentes
- Misma estructura de directorio `.git`

## ¿Qué incluye?

| Categoría | Lo que obtienes |
|----------|--------------|
| **Comandos Git** | 66 comandos: init, add, commit, branch, merge, rebase, cherry-pick, bisect, stash, worktree, submódulos... |
| **Herramientas IA** | Mensajes de commit, revisión de código, descripciones de PR, resolución de conflictos, búsqueda semántica |
| **Interfaces Visuales** | Interfaz web (`wit web`), Interfaz de terminal (`wit ui`), gráfico de commits |
| **Servidor Autoalojado** | Alojamiento Git con PRs, issues, webhooks, protección de ramas, lanzamientos |

## Estado

Este es software en etapa temprana. Lanzamos rápido, no perfecto.

- **Implementación Git**: 98% completa
- **Funciones IA**: 95% completa  
- **Plataforma/Servidor**: 90% completa
- **Interfaz Web**: 75% completa

Consulta la [HOJA DE RUTA](./ROADMAP.md) para ver los detalles y lo que viene.

## Documentación

| Recurso | Descripción |
|----------|-------------|
| [Inicio rápido](https://docs.wit.sh/quickstart) | De cero a productivo en 5 minutos |
| [¿Por qué wit?](https://docs.wit.sh/why-wit) | Los problemas que estamos resolviendo |
| [Comandos](https://docs.wit.sh/commands/overview) | Cada comando documentado |
| [Funciones IA](https://docs.wit.sh/features/ai-powered) | Mensajes de commit, revisión, búsqueda semántica |
| [Autoalojamiento](https://docs.wit.sh/platform/self-hosting) | Ejecuta tu propio servidor wit |
| [Visión IDE & Agent](./docs/IDE_AND_AGENT_VISION.mdx) | Nuestra hoja de ruta hacia el mejor IDE de todos los tiempos |

## Referencia de Comandos

```bash
# Básico
wit init                 # Inicializar nuevo repo
wit add . && wit commit  # Flujo de trabajo estándar
wit switch -c feature    # Crear y cambiar a rama
wit undo                 # Deshacer última operación

# IA (requiere OPENAI_API_KEY o ANTHROPIC_API_KEY)
wit ai commit -a -x      # La IA escribe el mensaje de commit
wit ai review            # La IA revisa tus cambios
wit search "how does X work?"

# Flujo de trabajo diario
wit wip -a               # Guardado rápido de trabajo en progreso
wit amend -m "fix typo"  # Corregir último commit
wit cleanup              # Eliminar ramas fusionadas
wit stash                # Guardar cambios temporalmente

# Visual
wit web                  # Interfaz web
wit ui                   # Interfaz de terminal
wit graph                # Gráfico de commits
```

## Autoalojamiento

wit puede funcionar como una plataforma completa de alojamiento Git, piensa en un GitHub autoalojado:

```bash
# Iniciar el servidor
wit serve --port 3000 --repos ./repos

# Iniciar la aplicación web
cd apps/web && npm run dev
```

Obtienes:
- **Alojamiento Git** vía HTTP y SSH
- **Solicitudes de pull** con revisiones, comentarios y opciones de merge
- **Issues** con flujos de trabajo inspirados en Linear
- Reglas de **protección de ramas**
- **Webhooks** para integraciones
- **API tRPC** para construir tus propias herramientas

### `wit web` vs `wit serve`

| | `wit web` | `wit serve` |
|---|-----------|-------------|
| **Propósito** | Ver el repo actual en el navegador | Alojar múltiples repos |
| **Configuración** | Ninguna | Base de datos + configuración |
| **Funciones** | Solo lectura en navegador | Plataforma completa (PRs, issues, auth) |
| **Caso de uso** | Visualización rápida | Colaboración en equipo |

## Requisitos

- **Node.js** >= 22.13.0
- Las **funciones de IA** requieren `OPENAI_API_KEY` o `ANTHROPIC_API_KEY`

## Construido Con

wit se apoya en los hombros de estos excelentes proyectos de código abierto:

### Backend

| Proyecto | Qué hace |
|---------|--------------|
| [Hono](https://github.com/honojs/hono) | Framework web rápido y ligero |
| [tRPC](https://github.com/trpc/trpc) | APIs tipadas de extremo a extremo |
| [Drizzle ORM](https://github.com/drizzle-team/drizzle-orm) | ORM para TypeScript con gran DX |
| [better-auth](https://github.com/better-auth/better-auth) | Autenticación para TypeScript |
| [Mastra](https://github.com/mastra-ai/mastra) | Framework de agentes IA |
| [Vercel AI SDK](https://github.com/vercel/ai) | Integraciones AI/LLM |
| [Zod](https://github.com/colinhacks/zod) | Validación de esquemas primero para TypeScript |

### Frontend

| Proyecto | Qué hace |
|---------|--------------|
| [React](https://github.com/facebook/react) | Biblioteca UI |
| [Vite](https://github.com/vitejs/vite) | Herramienta de build y servidor de desarrollo |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | CSS basado en utilidades |
| [Radix UI](https://github.com/radix-ui/primitives) | Componentes no estilizados y accesibles |
| [shadcn/ui](https://github.com/shadcn-ui/ui) | Componentes reutilizables basados en Radix |
| [Monaco Editor](https://github.com/microsoft/monaco-editor) | Editor de código que potencia VS Code |
| [Zustand](https://github.com/pmndrs/zustand) | Gestión de estado |
| [TanStack Query](https://github.com/TanStack/query) | Obtención y caché de datos |
| [React Flow](https://github.com/xyflow/xyflow) | UI de gráficos basados en nodos |
| [Lucide](https://github.com/lucide-icons/lucide) | Iconos |
| [Shiki](https://github.com/shikijs/shiki) | Resaltado de sintaxis |
| [cmdk](https://github.com/pacocoursey/cmdk) | Componente de paleta de comandos |
| [dnd-kit](https://github.com/clauderic/dnd-kit) | Kit de arrastrar y soltar |
| [React Router](https://github.com/remix-run/react-router) | Enrutamiento del lado del cliente |
| [date-fns](https://github.com/date-fns/date-fns) | Biblioteca de utilidades de fechas |

### CLI & TUI

| Proyecto | Qué hace |
|---------|--------------|
| [OpenTUI](https://github.com/pavi2410/opentui) | Framework de interfaz de terminal |
| [Solid.js](https://github.com/solidjs/solid) | Primitivas UI reactivas (para TUI) |

## Contribuir

¡Contribuciones bienvenidas! Consulta [CONTRIBUTING.md](./CONTRIBUTING.md) para ver las directrices.

```bash
git clone https://github.com/abhiaiyer91/wit.git
cd wit
npm install
npm run build
npm test
```

## Acerca de Este Proyecto

wit es un experimento en desarrollo de software dirigido por IA. La dirección técnica, la arquitectura y las prioridades están definidas por Claude (una IA), con un cofundador humano que brinda orientación y autonomía.

Lee más en la [HOJA DE RUTA](./ROADMAP.md).

## Licencia

MIT
