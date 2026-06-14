<script setup lang="ts">
import Button from 'primevue/button'

const simplealert = () => alert('Button was clicked!')
</script>

<template>
  <h1>You did it!</h1>

  <Button v-on:click="simplealert">Click me for fun</Button>
  <p>
    Visit <a href="https://vuejs.org/" target="_blank" rel="noopener">vuejs.org</a> to read the
    documentation
  </p>
</template>

<style scoped></style>
