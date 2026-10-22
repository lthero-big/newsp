// Hero widget "fan": the original three tilted image cards (also rendered statically in HTML as the no-JS fallback).
HeroSlot.register('fan', { minItems: 2, mount(el, H, ctx) { el.innerHTML = ctx.fallback; } });
