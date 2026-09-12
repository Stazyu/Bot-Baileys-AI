<script setup lang="ts">
import type { DialogTriggerProps } from "reka-ui"
import { reactiveOmit } from "@vueuse/core"
import { DialogTrigger, useForwardProps } from "reka-ui"

const props = defineProps<DialogTriggerProps>()

const delegatedProps = reactiveOmit(props, "as", "asChild")

const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <DialogTrigger
    data-slot="dialog-trigger"
    v-bind="forwarded"
  >
    <slot />
  </DialogTrigger>
</template>
