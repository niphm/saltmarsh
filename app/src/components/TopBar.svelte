<script lang="ts">
  import type { LoadResult } from "../lib/characters";
  import { href } from "../lib/route.svelte";

  let { characters, currentId, onSettings }: { characters: LoadResult[]; currentId?: string; onSettings: boolean } =
    $props();

  const firstName = (name: string) => name.split(" ")[0] || name;

  function skipToContent() {
    document.getElementById("main")?.focus();
  }
</script>

<button
  type="button"
  onclick={skipToContent}
  class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-3 focus:text-on-accent"
>
  Skip to content
</button>

<!-- Not sticky: on a sheet the status bar is what stays on screen. -->
<header class="border-b border-line bg-card pt-[env(safe-area-inset-top)]">
  <div class="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 px-4">
    <a
      href={characters[0] ? href.sheet(characters[0].id) : "#/"}
      class="flex min-h-12 items-center gap-2 font-display text-xl font-semibold text-accent"
    >
      <svg viewBox="0 0 512 512" class="size-7" aria-hidden="true">
        <g fill="none" stroke="currentColor" stroke-width="40" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="256" cy="122" r="38" />
          <path d="M256 160V420M180 222H332M110 300C122 378 186 420 256 420C326 420 390 378 402 300" />
          <path d="M86 330L110 294L144 318M368 318L402 294L426 330" />
        </g>
      </svg>
      Saltmarsh
    </a>

    <a
      href={href.settings}
      aria-label="Settings"
      aria-current={onSettings ? "page" : undefined}
      class="ml-auto flex size-11 items-center justify-center rounded-lg text-ink-muted hover:bg-well hover:text-ink aria-[current=page]:bg-well aria-[current=page]:text-accent md:order-last"
    >
      <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M10.3 4.3c.4-1.7 3-1.7 3.4 0a1.7 1.7 0 0 0 2.6 1.1c1.5-.9 3.3.8 2.4 2.4a1.7 1.7 0 0 0 1 2.5c1.8.4 1.8 3 0 3.4a1.7 1.7 0 0 0-1 2.6c.9 1.5-.9 3.3-2.4 2.4a1.7 1.7 0 0 0-2.6 1c-.4 1.8-3 1.8-3.4 0a1.7 1.7 0 0 0-2.5-1c-1.6.9-3.3-.9-2.4-2.4a1.7 1.7 0 0 0-1.1-2.6c-1.7-.4-1.7-3 0-3.4a1.7 1.7 0 0 0 1.1-2.5c-.9-1.6.8-3.3 2.4-2.4a1.7 1.7 0 0 0 2.5-1.1Z"
        />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </a>

    <nav aria-label="Characters" class="-mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 md:mx-0 md:w-auto md:flex-1 md:px-0">
      <ul class="flex gap-1">
        {#each characters as c (c.id)}
          {@const current = !onSettings && c.id === currentId}
          <li>
            <a
              href={href.sheet(c.id)}
              aria-current={current ? "page" : undefined}
              class="inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 whitespace-nowrap {current
                ? 'border-accent font-semibold text-ink'
                : 'border-transparent text-ink-muted hover:text-ink'}"
            >
              {#if !c.ok}
                <span aria-hidden="true" class="font-bold text-danger">!</span>
                <span class="sr-only">(invalid)</span>
              {/if}
              {firstName(c.name)}
            </a>
          </li>
        {/each}
      </ul>
    </nav>
  </div>
</header>
