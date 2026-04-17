<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

<template>
  <div class="dashboard-view">
    <h1>个人看板</h1>
    <QuotaProgressBar />
    <MetricCards />
  </div>
</template>

<script setup lang="ts">
import QuotaProgressBar from '@/components/QuotaProgressBar.vue'
import MetricCards from '@/components/MetricCards.vue'
</script>

<style scoped>
.dashboard-view {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px;
}

.dashboard-view h1 {
  margin-bottom: 20px;
}
</style>
