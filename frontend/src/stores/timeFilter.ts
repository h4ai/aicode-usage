// SPDX-License-Identifier: Apache-2.0
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type TimeFilter = 'all' | 'work' | 'non_work'

export const useTimeFilterStore = defineStore('timeFilter', () => {
  const timeFilter = ref<TimeFilter>((localStorage.getItem('timeFilter') as TimeFilter) || 'all')

  function setFilter(f: TimeFilter) {
    timeFilter.value = f
    localStorage.setItem('timeFilter', f)
  }

  const labels: Record<TimeFilter, string> = {
    all: '全天',
    work: '工作时段',
    non_work: '非工作时段',
  }

  return { timeFilter, setFilter, labels }
})
