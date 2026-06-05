document.addEventListener('DOMContentLoaded', () => {
  const backendUrl = document.getElementById('backendUrl')
  const apiToken = document.getElementById('apiToken')
  const saveBtn = document.getElementById('saveBtn')
  const status = document.getElementById('status')

  chrome.storage.sync.get(['backendUrl', 'apiToken'], (result) => {
    if (result.backendUrl) backendUrl.value = result.backendUrl
    if (result.apiToken) apiToken.value = result.apiToken
  })

  saveBtn.addEventListener('click', () => {
    const url = backendUrl.value.trim().replace(/\/+$/, '')
    const token = apiToken.value.trim()

    if (!url) {
      showStatus('请输入后端地址', 'error')
      return
    }
    if (!token) {
      showStatus('请输入 API Token', 'error')
      return
    }

    // Test connection
    fetch(`${url}/categories`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(() => {
        chrome.storage.sync.set({ backendUrl: url, apiToken: token }, () => {
          showStatus('保存成功！配置已生效', 'success')
        })
      })
      .catch((e) => {
        showStatus(`连接失败: ${e.message}，请检查地址或 Token`, 'error')
      })
  })

  function showStatus(msg, type) {
    status.textContent = msg
    status.className = type
  }
})
