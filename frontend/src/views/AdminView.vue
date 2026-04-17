<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

<template>
  <div class="admin-view">
    <h1>管理员后台</h1>
    <QuotaLevelManager />
    <UserManager />
  </div>
</template>

<script setup lang="ts">
import QuotaLevelManager from '@/components/QuotaLevelManager.vue'
import UserManager from '@/components/UserManager.vue'
</script>
