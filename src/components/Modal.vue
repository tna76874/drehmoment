<script setup>
defineProps({ title: String })
const emit = defineEmits(['close'])
</script>
<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" @click.self="emit('close')">
      <div class="max-h-[92dvh] w-full max-w-lg overflow-auto rounded-t-[28px] bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[28px]">
        <div class="mb-4 flex items-center gap-2">
          <h2 class="flex-1 text-lg">{{ title }}</h2>
          <button class="btn btn-ghost btn-icon" aria-label="Schließen" @click="emit('close')">✕</button>
        </div>
        <slot />
      </div>
    </div>
  </Teleport>
</template>
