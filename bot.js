// Konfigurasi API
const API_URL = 'https://witnesses-icon-configurations-chemical.trycloudflare.com'; // Ganti menggunakan http://127.0.0.1:8000 jika backend dijalankan di lokal pc
const API_TIMEOUT = 300000; // 5 menit timeout untuk file besar
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 5MB batas ukuran file untuk mempercepat upload
const POLLING_INTERVAL_SMALL = 1000; // Polling interval untuk jumlah gambar kecil (1 detik)
const POLLING_INTERVAL_LARGE = 3000; // Polling interval untuk jumlah gambar besar (3 detik)
const POLLING_INTERVAL_MAX = 10000; // Polling interval maksimum (10 detik)

// Tracking waktu
let processingStartTime = 0;
let imageProcessingTimes = {};
// Untuk menyimpan file yang sudah dikompresi
let multiCompressedFiles = [];

// DOM elements - Single mode
const singleModeBtn = document.getElementById('single-mode-btn');
const multiModeBtn = document.getElementById('multi-mode-btn');
const singleMode = document.getElementById('single-mode');
const multiMode = document.getElementById('multi-mode');
const dropArea = document.getElementById('drop-area');
const fileInput = document.getElementById('image');
const analyzeBtn = document.getElementById('analyze-btn');
const btnText = document.getElementById('btn-text');
const btnLoader = document.getElementById('btn-loader');
const previewPlaceholder = document.getElementById('preview-placeholder');
const imagePreview = document.getElementById('image-preview');
const fileInfo = document.getElementById('file-info');
const loading = document.getElementById('loading');
const result = document.getElementById('result');
const desc = document.getElementById('description');
const keywordsContainer = document.getElementById('keywords-container');
const copyDesc = document.getElementById('copy-desc');
const copyKeywords = document.getElementById('copy-keywords');
const notification = document.getElementById('notification');

// DOM elements - Multiple mode
const multiDropArea = document.getElementById('multi-drop-area');
const multiFileInput = document.getElementById('multi-image');
const analyzeMultipleBtn = document.getElementById('analyze-multiple-btn');
const multiBtnText = document.getElementById('multi-btn-text');
const multiBtnLoader = document.getElementById('multi-btn-loader');
const multiPreviewContainer = document.getElementById('multi-preview-container');
const multiResults = document.getElementById('multi-results');
const imageTabs = document.getElementById('image-tabs');
const tabContents = document.getElementById('tab-contents');

// DOM elements - Queue status
const queueStatus = document.getElementById('queue-status');
const queueStatusText = document.getElementById('queue-status-text');
const queueProgressBar = document.getElementById('queue-progress-bar');
const queueProgressText = document.getElementById('queue-progress-text');
const queueFileStatus = document.getElementById('queue-file-status');
const queueDetails = document.getElementById('queue-details');

// Format waktu dalam format yang mudah dibaca
function formatTime(milliseconds) {
  if (milliseconds < 1000) {
    return `${milliseconds}ms`;
  }
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) {
    return `${seconds} detik`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes} menit ${remainingSeconds} detik`;
}

// Fetch dengan timeout
async function fetchWithTimeout(url, options, timeout = API_TIMEOUT) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeout)
    )
  ]);
}

// Fungsi untuk kompresi gambar sebelum upload
function compressImage(file) {
  return new Promise((resolve, reject) => {
    // Jika file sudah kecil, tidak perlu kompresi
    if (file.size < 1024 * 1024) { // < 1MB
      resolve(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        // Tentukan ukuran maksimum
        const maxWidth = 1200;
        const maxHeight = 1200;
        
        let width = img.width;
        let height = img.height;
        
        // Perkecil ukuran jika perlu
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Konversi ke file dengan kualitas lebih rendah
        canvas.toBlob((blob) => {
          // Jika ukuran kompresi lebih besar dari asli, gunakan yang asli
          if (blob.size >= file.size) {
            resolve(file);
          } else {
            const newFile = new File([blob], file.name, { type: 'image/jpeg' });
            resolve(newFile);
          }
        }, 'image/jpeg', 0.7); // Kualitas 70%
      };
      img.onerror = () => reject(new Error('Gagal memuat gambar untuk kompresi'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsDataURL(file);
  });
}

// Mode switching
singleModeBtn.addEventListener('click', function() {
  singleModeBtn.classList.remove('bg-white', 'text-gray-700', 'border-t', 'border-b', 'border-r', 'border-gray-300');
  singleModeBtn.classList.add('bg-primary-600', 'text-white');
  
  multiModeBtn.classList.remove('bg-primary-600', 'text-white');
  multiModeBtn.classList.add('bg-white', 'text-gray-700', 'border-t', 'border-b', 'border-r', 'border-gray-300');
  
  singleMode.classList.remove('hidden');
  multiMode.classList.add('hidden');
  result.classList.add('hidden');
  multiResults.classList.add('hidden');
  queueStatus.classList.add('hidden');
});

multiModeBtn.addEventListener('click', function() {
  multiModeBtn.classList.remove('bg-white', 'text-gray-700', 'border-t', 'border-b', 'border-r', 'border-gray-300');
  multiModeBtn.classList.add('bg-primary-600', 'text-white');
  
  singleModeBtn.classList.remove('bg-primary-600', 'text-white');
  singleModeBtn.classList.add('bg-white', 'text-gray-700', 'border-t', 'border-b', 'border-r', 'border-gray-300');
  
  multiMode.classList.remove('hidden');
  singleMode.classList.add('hidden');
  result.classList.add('hidden');
  multiResults.classList.add('hidden');
  queueStatus.classList.add('hidden');
  
  // Reset tracking waktu
  processingStartTime = 0;
  imageProcessingTimes = {};
});

// File drag and drop - Single mode
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropArea.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
  dropArea.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropArea.addEventListener(eventName, unhighlight, false);
});

function highlight() {
  dropArea.classList.add('active');
}

function unhighlight() {
  dropArea.classList.remove('active');
}

dropArea.addEventListener('drop', handleDrop, false);

function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;
  
  if (files.length) {
    fileInput.files = files;
    handleFiles(files[0]);
  }
}

// Handle file selection - Single mode
fileInput.addEventListener('change', function() {
  if (this.files.length) {
    handleFiles(this.files[0]);
  }
});

async function handleFiles(file) {
  // Check if file is an image
  if (!file.type.match('image.*')) {
    showNotification('Silakan pilih file gambar', 'error');
    return;
  }
  
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    showNotification(`Ukuran file terlalu besar (maks. ${MAX_FILE_SIZE/1024/1024}MB)`, 'error');
    return;
  }
  
  try {
    // Kompresi file sebelum preview
    const compressedFile = await compressImage(file);
    
    // Display file info with compression info
    const originalSize = (file.size / 1024 / 1024).toFixed(2);
    const compressedSize = (compressedFile.size / 1024 / 1024).toFixed(2);
    
    if (compressedFile.size < file.size) {
      fileInfo.textContent = `${file.name} (${compressedSize} MB - dikompresi dari ${originalSize} MB)`;
    } else {
      fileInfo.textContent = `${file.name} (${originalSize} MB)`;
    }
    
    // Preview image
    const reader = new FileReader();
    reader.onload = function(e) {
      imagePreview.src = e.target.result;
      imagePreview.classList.remove('hidden');
      previewPlaceholder.classList.add('hidden');
    };
    reader.readAsDataURL(compressedFile);
    
    // Store compressed file for upload
    fileInput.compressedFile = compressedFile;
    
    // Enable analyze button
    analyzeBtn.disabled = false;
  } catch (error) {
    console.error('Error handling file:', error);
    showNotification('Error saat memproses file', 'error');
  }
}

// File drag and drop - Multiple mode
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  multiDropArea.addEventListener(eventName, preventDefaults, false);
});

['dragenter', 'dragover'].forEach(eventName => {
  multiDropArea.addEventListener(eventName, function() {
    multiDropArea.classList.add('active');
  }, false);
});

['dragleave', 'drop'].forEach(eventName => {
  multiDropArea.addEventListener(eventName, function() {
    multiDropArea.classList.remove('active');
  }, false);
});

multiDropArea.addEventListener('drop', handleMultiDrop, false);

function handleMultiDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;
  
  if (files.length) {
    multiFileInput.files = files;
    handleMultipleFiles(files);
  }
}

// Handle file selection - Multiple mode
multiFileInput.addEventListener('change', function() {
  if (this.files.length) {
    handleMultipleFiles(this.files);
  }
});

async function handleMultipleFiles(files) {
  // Clear previous previews
  multiPreviewContainer.innerHTML = '';
  multiCompressedFiles = [];
  
  // Muat dan kompresi file
  const compressionPromises = [];
  const previewPromises = [];
  let validFiles = 0;
  let invalidSizeFiles = 0;
  
  // Buat elemen loading
  const loadingElement = document.createElement('div');
  loadingElement.className = 'col-span-full text-center py-6';
  loadingElement.innerHTML = `
    <div class="inline-flex items-center px-4 py-2 bg-blue-100 text-blue-700 rounded-md">
      <div class="animate-spin mr-3 h-5 w-5 text-blue-600">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
      <span>Memproses gambar...</span>
    </div>
  `;
  
  multiPreviewContainer.appendChild(loadingElement);
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    // Check if file is an image
    if (!file.type.match('image.*')) {
      continue;
    }
    
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      invalidSizeFiles++;
      continue;
    }
    
    validFiles++;
    
    // Compress image
    const compressionPromise = compressImage(file).then(compressedFile => {
      multiCompressedFiles.push({
        original: file,
        compressed: compressedFile,
        filename: file.name
      });
      
      return { file, compressedFile };
    }).catch(err => {
      console.error(`Error compressing ${file.name}:`, err);
      multiCompressedFiles.push({
        original: file,
        compressed: file, // Use original if compression fails
        filename: file.name
      });
      
      return { file, compressedFile: file };
    });
    
    compressionPromises.push(compressionPromise);
  }
  
  try {
    // Tunggu semua proses kompresi selesai
    const compressedResults = await Promise.all(compressionPromises);
    
    // Hapus loading element
    multiPreviewContainer.removeChild(loadingElement);
    
    // Preview images
    for (const { file, compressedFile } of compressedResults) {
      const previewWrapper = document.createElement('div');
      previewWrapper.className = 'relative border rounded-md overflow-hidden h-32';
      previewWrapper.setAttribute('data-filename', file.name);
      
      const img = document.createElement('img');
      img.className = 'w-full h-full object-cover';
      
      const reader = new FileReader();
      const readerPromise = new Promise((resolve) => {
        reader.onload = function(e) {
          img.src = e.target.result;
          resolve();
        };
      });
      reader.readAsDataURL(compressedFile);
      
      previewPromises.push(readerPromise);
      
      // Tambahkan status badge
      const statusBadge = document.createElement('div');
      statusBadge.className = 'file-status-badge bg-gray-200 text-gray-800';
      statusBadge.textContent = 'Pending';
      
      // Tambahkan badge untuk waktu pemrosesan
      const timeBadge = document.createElement('div');
      timeBadge.className = 'absolute top-1 left-1 bg-gray-800 bg-opacity-75 text-white text-xs px-2 py-1 rounded-md hidden';
      timeBadge.setAttribute('data-time-badge', file.name);
      
      // Tambahkan info kompresi jika berhasil dikompresi
      if (compressedFile.size < file.size) {
        const originalSizeMB = (file.size / 1024 / 1024).toFixed(2);
        const compressedSizeMB = (compressedFile.size / 1024 / 1024).toFixed(2);
        const compressionBadge = document.createElement('div');
        compressionBadge.className = 'absolute bottom-1 right-1 bg-green-800 bg-opacity-75 text-white text-xs px-2 py-1 rounded-md';
        compressionBadge.textContent = `${(100 - (compressedFile.size / file.size * 100)).toFixed(0)}% ↓`;
        previewWrapper.appendChild(compressionBadge);
      }
      
      previewWrapper.appendChild(img);
      previewWrapper.appendChild(statusBadge);
      previewWrapper.appendChild(timeBadge);
      multiPreviewContainer.appendChild(previewWrapper);
    }
    
    // Wait for all image previews to load
    await Promise.all(previewPromises);
    
    // Enable analyze button if there are valid files
    analyzeMultipleBtn.disabled = validFiles === 0;
    
    if (validFiles === 0) {
      showNotification('Silakan pilih minimal satu file gambar yang valid', 'error');
    }
    
    if (invalidSizeFiles > 0) {
      showNotification(`${invalidSizeFiles} file tidak diproses karena melebihi batas ukuran (${MAX_FILE_SIZE/1024/1024}MB)`, 'error');
    }
    
    // Tampilkan info kompresi jika berhasil
    const totalOriginalSize = multiCompressedFiles.reduce((acc, item) => acc + item.original.size, 0);
    const totalCompressedSize = multiCompressedFiles.reduce((acc, item) => acc + item.compressed.size, 0);
    
    if (totalCompressedSize < totalOriginalSize) {
      const originalSizeMB = (totalOriginalSize / 1024 / 1024).toFixed(2);
      const compressedSizeMB = (totalCompressedSize / 1024 / 1024).toFixed(2);
      const savingsPercent = ((totalOriginalSize - totalCompressedSize) / totalOriginalSize * 100).toFixed(0);
      
      showNotification(`Ukuran gambar terkompresi dari ${originalSizeMB}MB menjadi ${compressedSizeMB}MB (hemat ${savingsPercent}%)`);
    }
    
  } catch (err) {
    console.error('Error processing files:', err);
    multiPreviewContainer.innerHTML = '';
    showNotification('Error saat memproses gambar', 'error');
  }
}

// Analyze button click - Single mode
analyzeBtn.addEventListener('click', async function() {
  if (!fileInput.files.length) return;
  
  // Mulai tracking waktu
  const startTime = Date.now();
  
  // Show loading state
  btnText.textContent = 'Memproses...';
  btnLoader.classList.remove('hidden');
  analyzeBtn.disabled = true;
  loading.classList.remove('hidden');
  result.classList.add('hidden');
  
  const formData = new FormData();
  // Gunakan file yang sudah dikompresi jika tersedia
  const fileToUpload = fileInput.compressedFile || fileInput.files[0];
  formData.append('file', fileToUpload);
  
  try {
    const res = await fetchWithTimeout(`${API_URL}/analyze-image`, {
      method: 'POST',
      body: formData
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: 'Error tidak diketahui' }));
      throw new Error(errorData.detail || 'Gagal menganalisis gambar');
    }
    
    const data = await res.json();
    
    // Hitung waktu pemrosesan
    const processingTime = Date.now() - startTime;
    
    // Tampilkan waktu pemrosesan
    showNotification(`Selesai dalam ${formatTime(processingTime)}`);
    
    // Display results
    displayResults(data);
  } catch (err) {
    console.error('Error:', err);
    showNotification(err.message, 'error');
  } finally {
    // Reset button state
    btnText.textContent = 'Upload & Analyze';
    btnLoader.classList.add('hidden');
    analyzeBtn.disabled = false;
    loading.classList.add('hidden');
  }
});

// Function to update preview status badges
function updatePreviewBadge(filename, status, isProcessing = false, processingTime = null) {
  const previewElement = [...multiPreviewContainer.children].find(
    el => el.getAttribute('data-filename') === filename
  );
  
  if (!previewElement) return;
  
  const statusBadge = previewElement.querySelector('.file-status-badge');
  if (!statusBadge) return;
  
  // Reset classes
  statusBadge.className = 'file-status-badge';
  
  switch(status) {
    case 'pending':
      statusBadge.classList.add('bg-gray-200', 'text-gray-800');
      statusBadge.textContent = 'Pending';
      break;
    case 'processing':
      statusBadge.classList.add('bg-blue-200', 'text-blue-800', isProcessing ? 'pulse-animation' : '');
      statusBadge.textContent = 'Processing';
      break;
    case 'completed':
      statusBadge.classList.add('bg-green-200', 'text-green-800');
      statusBadge.textContent = 'Completed';
      
      // Tampilkan waktu pemrosesan jika tersedia
      if (processingTime) {
        const timeBadge = previewElement.querySelector('[data-time-badge]');
        if (timeBadge) {
          timeBadge.textContent = formatTime(processingTime);
          timeBadge.classList.remove('hidden');
        }
      }
      break;
    case 'error':
      statusBadge.classList.add('bg-red-200', 'text-red-800');
      statusBadge.textContent = 'Error';
      break;
  }
}

// Function to calculate and update the actual progress percentage
function calculateActualProgress(status) {
  if (!status || !status.total_files) return 0;
  
  // Jika status completed, kembalikan 100%
  if (status.status === 'completed') return 100;
  
  // Hitung jumlah file yang selesai (current_file - 1) dan yang sedang diproses (0.5)
  const completedFiles = Math.max(0, status.current_file - 1); // File sebelum current sudah selesai
  const currentFileProgress = 0.5; // Anggap file saat ini setengah selesai
  
  // Total progress adalah file selesai + progress file saat ini
  const totalProgress = ((completedFiles + currentFileProgress) / status.total_files) * 100;
  
  return Math.min(99, Math.round(totalProgress)); // Maksimal 99% sampai benar-benar selesai
}

// Function to poll queue status with retry
async function pollQueueStatus(queueId, retryCount = 0, totalImages = 0) {
  try {
    // Tentukan interval polling berdasarkan jumlah gambar
    const baseInterval = totalImages > 20 ? POLLING_INTERVAL_LARGE : POLLING_INTERVAL_SMALL;
    // Jika retry, tambahkan backoff
    const pollingInterval = retryCount > 0 ? Math.min(baseInterval * Math.pow(1.5, retryCount), POLLING_INTERVAL_MAX) : baseInterval;
    
    const res = await fetchWithTimeout(`${API_URL}/queue-status/${queueId}`);
    
    if (res.status === 404 && retryCount < 5) {
      console.warn(`Queue ${queueId} not found, retrying (${retryCount + 1}/5)...`);
      // Exponential backoff for retries
      const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
      return pollQueueStatus(queueId, retryCount + 1, totalImages);
    }
    
    if (!res.ok) {
      throw new Error(`Server merespons dengan status ${res.status}`);
    }
    
    const data = await res.json();
    
    // Jika status adalah estimasi, tampilkan pesan khusus
    if (data.is_estimated) {
      showNotification("Menggunakan progress perkiraan karena status asli tidak ditemukan", "warning");
    }
    
    // Hitung progress yang sebenarnya berdasarkan file yang sudah selesai
    const actualProgress = calculateActualProgress(data);
    
    // Ganti progress dari server dengan perhitungan kita
    data.progress = actualProgress;
    
    // Update UI with current status
    updateQueueStatusUI(data);
    
    // Tambahkan informasi estimasi waktu jika tersedia
    if (data.estimated_time_remaining) {
      const minutes = Math.floor(data.estimated_time_remaining / 60);
      const seconds = data.estimated_time_remaining % 60;
      let timeText = "";
      
      if (minutes > 0) {
        timeText = `${minutes} menit ${seconds} detik`;
      } else {
        timeText = `${seconds} detik`;
      }
      
      queueStatusText.textContent = `Memproses gambar dalam antrian... (${data.progress}%) - Perkiraan sisa waktu: ${timeText}`;
    }
    
    // Update antrian informasi jika tersedia
    if (data.queue_size > 0) {
      showNotification(`Ada ${data.queue_size} gambar dalam antrian. API Gemini dibatasi 15 request/menit, harap bersabar.`, "info");
    }
    
    // If processing is still ongoing, poll again after a delay
    if (data.status !== 'completed' && data.status !== 'error') {
      // Gunakan interval polling yang dinamis
      setTimeout(() => pollQueueStatus(queueId, 0, totalImages), pollingInterval);
    } else {
      // Processing completed, show results
      if (data.status === 'completed' && data.results) {
        // Hitung waktu total
        const totalProcessingTime = data.total_processing_time || (Date.now() - processingStartTime);
        
        // Tampilkan hasil
        displayMultipleResults(data.results, totalProcessingTime);
        queueStatus.classList.add('hidden');
        
        // Tampilkan notifikasi sukses dengan jumlah file yang berhasil dan gagal
        const successCount = data.results.filter(r => !r.error).length;
        const failCount = data.results.filter(r => r.error).length;
        
        if (failCount > 0) {
          showNotification(`Selesai memproses ${successCount} gambar (${failCount} gagal) dalam ${formatTime(totalProcessingTime)}`, 
                           failCount > successCount ? "error" : "warning");
        } else {
          showNotification(`Berhasil memproses ${successCount} gambar dalam ${formatTime(totalProcessingTime)}`);
        }
      } else if (data.status === 'error') {
        showNotification(data.error || 'Terjadi kesalahan saat memproses', 'error');
        queueStatus.classList.add('hidden');
      }
    }
    
  } catch (error) {
    console.error('Error polling queue status:', error);
    
    // Coba retry beberapa kali jika terjadi error
    if (retryCount < 5) {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
      showNotification(`Error saat memeriksa status: mencoba lagi dalam ${delay/1000} detik...`, "warning");
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return pollQueueStatus(queueId, retryCount + 1, totalImages);
    } else {
      showNotification('Gagal memeriksa status pemrosesan setelah beberapa percobaan', 'error');
      
      // Reset UI
      queueStatus.classList.add('hidden');
      multiBtnText.textContent = 'Upload & Analyze All Images';
      multiBtnLoader.classList.add('hidden');
      analyzeMultipleBtn.disabled = false;
    }
  }
}

// Function to update queue status UI
function updateQueueStatusUI(status) {
  // Update progress bar
  queueProgressBar.style.width = `${status.progress}%`;
  queueProgressText.textContent = `${status.progress}%`;
  
  // Update file status text
  if (status.current_file && status.total_files) {
    queueFileStatus.textContent = `Memproses file ${status.current_file} dari ${status.total_files}`;
    
    // Update preview badges
    if (status.current_job) {
      const currentJobId = status.current_job;
      const currentFilename = status.current_job_filename;
      
      // Catat waktu mulai untuk file saat ini
      if (!imageProcessingTimes[currentFilename] || !imageProcessingTimes[currentFilename].startTime) {
        imageProcessingTimes[currentFilename] = { 
          startTime: Date.now() 
        };
      }
      
      // Set all files as pending or completed based on their position
      const fileElements = multiPreviewContainer.children;
      for (let i = 0; i < fileElements.length; i++) {
        const filename = fileElements[i].getAttribute('data-filename');
        
        // File sebelumnya sudah selesai
        if (i + 1 < status.current_file) {
          // Jika belum ada data waktu proses, hitung perkiraan
          if (!imageProcessingTimes[filename] || !imageProcessingTimes[filename].time) {
            imageProcessingTimes[filename] = { 
              time: 2000 + Math.random() * 3000 // Nilai default/dummy (2-5 detik)
            };
          }
          
          updatePreviewBadge(filename, 'completed', false, imageProcessingTimes[filename].time);
        } 
        // File yang sedang diproses
        else if (i + 1 === status.current_file) {
          updatePreviewBadge(filename, 'processing', true);
        } 
        // File yang belum diproses
        else {
          updatePreviewBadge(filename, 'pending');
        }
      }
    }
  }
  
  // Update queue status text based on status
  if (status.status === 'initializing') {
    queueStatusText.textContent = 'Memulai pemrosesan...';
  } else if (status.status === 'completed') {
    queueStatusText.textContent = 'Pemrosesan selesai!';
  } else if (status.status === 'error') {
    queueStatusText.textContent = 'Terjadi kesalahan saat memproses gambar';
  } else {
    queueStatusText.textContent = `Memproses gambar dalam antrian... (${status.progress}%)`;
  }
  
  // Update queue details
  updateQueueDetails(status);
}

// Function to update queue details section
function updateQueueDetails(status) {
  // If we're in a completed state with results, don't update the details
  if (status.status === 'completed' && status.results) return;
  
  let detailsHTML = '';
  
  if (status.status === 'initializing') {
    detailsHTML = `
      <div class="text-sm text-gray-600">
        <p>Mempersiapkan pemrosesan ${status.total_files} gambar...</p>
      </div>
    `;
  } else if (status.current_file && status.total_files) {
    // Hitung waktu yang sudah berjalan sejak mulai pemrosesan
    const elapsedTime = processingStartTime ? Date.now() - processingStartTime : 0;
    
    // Tambahkan informasi tentang antrian dan estimasi
    let estimationHTML = '';
    if (status.estimated_time_remaining) {
      const minutes = Math.floor(status.estimated_time_remaining / 60);
      const seconds = status.estimated_time_remaining % 60;
      
      estimationHTML = `
        <p class="mt-2 font-medium">Informasi Antrian:</p>
        <p>• Perkiraan waktu tersisa: ${minutes > 0 ? `${minutes} menit ${seconds} detik` : `${seconds} detik`}</p>
        <p class="text-xs text-amber-600">• Catatan: API Gemini dibatasi 15 request/menit</p>
      `;
    }
    
    detailsHTML = `
      <div class="text-sm text-gray-600">
        <p class="font-medium">Progress Antrian:</p>
        <p>• Memproses gambar ${status.current_file} dari ${status.total_files}</p>
        <p>• Progress keseluruhan: ${status.progress}%</p>
        <p>• Waktu berjalan: ${formatTime(elapsedTime)}</p>
        ${estimationHTML}
      </div>
    `;
    
    // Tambahkan detail waktu per file yang sudah selesai
    if (Object.keys(imageProcessingTimes).length > 0) {
      detailsHTML += `
        <div class="mt-3">
          <p class="font-medium text-sm text-gray-600">Waktu Pemrosesan:</p>
          <div class="mt-1 text-xs space-y-1">
      `;
      
      for (const [filename, timeData] of Object.entries(imageProcessingTimes)) {
        if (timeData.time) {
          detailsHTML += `<p>• ${filename}: ${formatTime(timeData.time)}</p>`;
        }
      }
      
      detailsHTML += `
          </div>
        </div>
      `;
    }
  }
  
  queueDetails.innerHTML = detailsHTML;
}

// Analyze button click - Multiple mode
analyzeMultipleBtn.addEventListener('click', async function() {
  if (!multiCompressedFiles || multiCompressedFiles.length === 0) {
    showNotification('Tidak ada file valid untuk diproses', 'error');
    return;
  }
  
  // Mulai tracking waktu
  processingStartTime = Date.now();
  imageProcessingTimes = {};
  
  // Show loading state
  multiBtnText.textContent = 'Memproses...';
  multiBtnLoader.classList.remove('hidden');
  analyzeMultipleBtn.disabled = true;
  queueStatus.classList.remove('hidden');
  multiResults.classList.add('hidden');
  
  // Reset queue status UI
  queueProgressBar.style.width = '0%';
  queueProgressText.textContent = '0%';
  queueStatusText.textContent = 'Memulai analisis...';
  queueDetails.innerHTML = `
    <div class="animate-pulse">
      <div class="h-4 bg-gray-200 rounded w-3/4 mb-2.5"></div>
      <div class="h-4 bg-gray-200 rounded w-1/2 mb-2.5"></div>
      <div class="h-4 bg-gray-200 rounded w-5/6"></div>
    </div>
  `;
  
  // Set all previews to pending
  multiCompressedFiles.forEach(fileData => {
    updatePreviewBadge(fileData.filename, 'pending');
  });
  
  const formData = new FormData();
  
  // Add each compressed file to the formData
  multiCompressedFiles.forEach(fileData => {
    formData.append('files', fileData.compressed);
  });
  
  try {
    console.log(`Mengirim ${multiCompressedFiles.length} file ke server...`);
    
    // Tampilkan pesan khusus jika jumlah file > 15
    if (multiCompressedFiles.length > 15) {
      showNotification(`Memproses ${multiCompressedFiles.length} gambar (melebihi batas 15/menit). Sistem akan mengantri otomatis.`, "info");
    }
    
    const res = await fetchWithTimeout(`${API_URL}/analyze-multiple-images`, {
      method: 'POST',
      body: formData
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: 'Error tidak diketahui' }));
      throw new Error(errorData.detail || `Server merespons dengan status ${res.status}`);
    }
    
    const data = await res.json();
    console.log('Antrian dimulai:', data);
    
    if (data.queue_id) {
      // Jika ada estimasi waktu, tampilkan
      if (data.estimated_seconds) {
        const minutes = Math.floor(data.estimated_seconds / 60);
        const seconds = data.estimated_seconds % 60;
        showNotification(`Perkiraan waktu pemrosesan: ${minutes > 0 ? `${minutes} menit ${seconds} detik` : `${seconds} detik`}`);
      }
      
      // Start polling for status updates, kirim juga jumlah gambar
      pollQueueStatus(data.queue_id, 0, multiCompressedFiles.length);
    } else {
      throw new Error('Tidak ada ID antrian yang diterima dari server');
    }
  } catch (err) {
    console.error('Error saat upload:', err);
    showNotification(err.message, 'error');
    
    // Reset UI
    queueStatus.classList.add('hidden');
    multiBtnText.textContent = 'Upload & Analyze All Images';
    multiBtnLoader.classList.add('hidden');
    analyzeMultipleBtn.disabled = false;
  }
});

// Display analysis results - Single mode
function displayResults(data) {
  // Description
  desc.textContent = data.description || 'Tidak ada deskripsi tersedia';
  
  // Keywords
  keywordsContainer.innerHTML = '';
  if (data.keywords && Array.isArray(data.keywords) && data.keywords.length > 0) {
    data.keywords.forEach(keyword => {
      if (keyword && keyword.trim()) {
        const tag = document.createElement('span');
        tag.className = 'px-2 py-1 bg-gray-200 text-gray-800 text-sm rounded-md';
        tag.textContent = keyword.trim();
        keywordsContainer.appendChild(tag);
      }
    });
  } else {
    keywordsContainer.textContent = 'Tidak ada kata kunci tersedia';
  }
  
  result.classList.remove('hidden');
  
  // Scroll to results
  result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Display analysis results - Multiple mode
async function handleMultipleFiles(files) {
  // Clear previous previews
  multiPreviewContainer.innerHTML = '';
  multiCompressedFiles = [];
  
  // Muat dan kompresi file
  const compressionPromises = [];
  const previewPromises = [];
  let validFiles = 0;
  let invalidSizeFiles = 0;
  
  // Buat elemen loading
  const loadingElement = document.createElement('div');
  loadingElement.className = 'col-span-full text-center py-6';
  loadingElement.innerHTML = `
    <div class="inline-flex items-center px-4 py-2 bg-blue-100 text-blue-700 rounded-md">
      <div class="animate-spin mr-3 h-5 w-5 text-blue-600">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
      <span>Memproses gambar...</span>
    </div>
  `;
  
  multiPreviewContainer.appendChild(loadingElement);
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    // Check if file is an image
    if (!file.type.match('image.*')) {
      continue;
    }
    
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      invalidSizeFiles++;
      continue;
    }
    
    validFiles++;
    
    // Compress image
    const compressionPromise = compressImage(file).then(compressedFile => {
      multiCompressedFiles.push({
        original: file,
        compressed: compressedFile,
        filename: file.name
      });
      
      return { file, compressedFile };
    }).catch(err => {
      console.error(`Error compressing ${file.name}:`, err);
      multiCompressedFiles.push({
        original: file,
        compressed: file, // Use original if compression fails
        filename: file.name
      });
      
      return { file, compressedFile: file };
    });
    
    compressionPromises.push(compressionPromise);
  }
  
  try {
    // Tunggu semua proses kompresi selesai
    const compressedResults = await Promise.all(compressionPromises);
    
    // Hapus loading element
    multiPreviewContainer.removeChild(loadingElement);
    
    // Preview images
    for (const { file, compressedFile } of compressedResults) {
      const previewWrapper = document.createElement('div');
      // Ubah class dan tambahkan data-filename untuk hover effect
      previewWrapper.className = 'relative border rounded-md overflow-hidden h-32 preview-wrapper';
      previewWrapper.setAttribute('data-filename', file.name);
      previewWrapper.setAttribute('data-file-id', generateFileId(file.name));
      
      const img = document.createElement('img');
      img.className = 'w-full h-full object-cover';
      
      const reader = new FileReader();
      const readerPromise = new Promise((resolve) => {
        reader.onload = function(e) {
          img.src = e.target.result;
          resolve();
        };
      });
      reader.readAsDataURL(compressedFile);
      
      previewPromises.push(readerPromise);
      
      // Tambahkan status badge
      const statusBadge = document.createElement('div');
      statusBadge.className = 'file-status-badge bg-gray-200 text-gray-800';
      statusBadge.textContent = 'Pending';
      
      // Tambahkan badge untuk waktu pemrosesan
      const timeBadge = document.createElement('div');
      timeBadge.className = 'absolute top-1 left-1 bg-gray-800 bg-opacity-75 text-white text-xs px-2 py-1 rounded-md hidden';
      timeBadge.setAttribute('data-time-badge', file.name);
      
      // Tambahkan info kompresi jika berhasil dikompresi
      if (compressedFile.size < file.size) {
        const originalSizeMB = (file.size / 1024 / 1024).toFixed(2);
        const compressedSizeMB = (compressedFile.size / 1024 / 1024).toFixed(2);
        const compressionBadge = document.createElement('div');
        compressionBadge.className = 'absolute bottom-1 right-1 bg-green-800 bg-opacity-75 text-white text-xs px-2 py-1 rounded-md';
        compressionBadge.textContent = `${(100 - (compressedFile.size / file.size * 100)).toFixed(0)}% ↓`;
        previewWrapper.appendChild(compressionBadge);
      }
      
      previewWrapper.appendChild(img);
      previewWrapper.appendChild(statusBadge);
      previewWrapper.appendChild(timeBadge);
      multiPreviewContainer.appendChild(previewWrapper);
    }
    
    // Wait for all image previews to load
    await Promise.all(previewPromises);
    
    // Enable analyze button if there are valid files
    analyzeMultipleBtn.disabled = validFiles === 0;
    
    if (validFiles === 0) {
      showNotification('Silakan pilih minimal satu file gambar yang valid', 'error');
    }
    
    if (invalidSizeFiles > 0) {
      showNotification(`${invalidSizeFiles} file tidak diproses karena melebihi batas ukuran (${MAX_FILE_SIZE/1024/1024}MB)`, 'error');
    }
    
    // Tampilkan info kompresi jika berhasil
    const totalOriginalSize = multiCompressedFiles.reduce((acc, item) => acc + item.original.size, 0);
    const totalCompressedSize = multiCompressedFiles.reduce((acc, item) => acc + item.compressed.size, 0);
    
    if (totalCompressedSize < totalOriginalSize) {
      const originalSizeMB = (totalOriginalSize / 1024 / 1024).toFixed(2);
      const compressedSizeMB = (totalCompressedSize / 1024 / 1024).toFixed(2);
      const savingsPercent = ((totalOriginalSize - totalCompressedSize) / totalOriginalSize * 100).toFixed(0);
      
      showNotification(`Ukuran gambar terkompresi dari ${originalSizeMB}MB menjadi ${compressedSizeMB}MB (hemat ${savingsPercent}%)`);
    }
    
  } catch (err) {
    console.error('Error processing files:', err);
    multiPreviewContainer.innerHTML = '';
    showNotification('Error saat memproses gambar', 'error');
  }
}

// Tambahkan fungsi untuk menghasilkan ID unik dari nama file
function generateFileId(filename) {
  return filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

// Tambahkan fungsi untuk highlight image saat tab diklik
function highlightMatchingPreview(filename) {
  // Hapus highlight dari semua preview sebelumnya
  const allPreviews = document.querySelectorAll('.preview-wrapper');
  allPreviews.forEach(preview => preview.classList.remove('active-preview'));
  
  // Tambahkan highlight ke preview yang sesuai
  const matchingPreview = [...allPreviews].find(
    el => el.getAttribute('data-filename') === filename
  );
  
  if (matchingPreview) {
    matchingPreview.classList.add('active-preview');
    // Scroll ke elemen agar terlihat
    matchingPreview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// Ubah fungsi displayMultipleResults untuk menambahkan fungsionalitas highlight
function displayMultipleResults(results, totalProcessingTime) {
  // Clear previous results
  imageTabs.innerHTML = '';
  tabContents.innerHTML = '';
  
  console.log("Memproses hasil:", results);
  
  // Check if results is valid
  if (!results || !Array.isArray(results) || results.length === 0) {
    showNotification('Tidak ada hasil valid yang dikembalikan dari server', 'error');
    return;
  }

  // Filter out null results
  const validResults = results.filter(result => result !== null);
  
  if (validResults.length === 0) {
    showNotification('Tidak ada hasil valid yang diterima dari server', 'error');
    return;
  }
  
  console.log(`Menerima ${validResults.length} hasil valid dari ${results.length} total gambar`);
  
  // Create tabs and content for each result
  results.forEach((result, index) => {
    // Gunakan waktu pemrosesan dari backend
    const processingTime = result.processing_time || 
      (imageProcessingTimes[result.filename] ? 
        imageProcessingTimes[result.filename].time : 
        3000); // fallback ke 3 detik jika tidak ada data
    
    result.processingTime = processingTime;
    
    // Create tab with hover preview
    const tab = document.createElement('button');
    tab.className = 'px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 whitespace-nowrap tab-with-preview';
    tab.setAttribute('data-tab', `tab-${index}`);
    tab.setAttribute('data-filename', result.filename);
    if (index === 0) tab.classList.add('border-b-2', 'border-primary-600', 'text-primary-700');
    
    const filename = result.filename || `Gambar ${index + 1}`;
    
    // Tambahkan thumbnail dari server untuk preview saat hover
    let previewHtml = '';
    if (result.thumbnail) {
      previewHtml = `
        <div class="tab-image-preview">
          <img src="data:image/jpeg;base64,${result.thumbnail}" 
              alt="${filename}" 
              class="w-32 h-32 object-cover rounded-md" />
        </div>
      `;
    }
    
    tab.innerHTML = `
      <span class="truncate max-w-xs">${filename}</span>
      ${previewHtml}
    `;
    
    // Tambahkan event listener untuk highlight preview saat tab diklik
    tab.addEventListener('click', function() {
      const filename = this.getAttribute('data-filename');
      if (filename) {
        highlightMatchingPreview(filename);
      }
    });
    
    imageTabs.appendChild(tab);
    
    // Create content
    const content = document.createElement('div');
    content.className = 'tab-content' + (index === 0 ? '' : ' hidden');
    content.id = `tab-${index}`;
    
    if (result.error) {
      content.innerHTML = `
        <div class="p-4 bg-red-50 text-red-700 rounded-md">
          <p><i class="fas fa-exclamation-circle mr-2"></i> Error: ${result.error}</p>
        </div>
      `;
    } else {
      let keywordsHTML = '';
      
      if (result.keywords && Array.isArray(result.keywords) && result.keywords.length > 0) {
        keywordsHTML = result.keywords.map(kw => 
          `<span class="px-2 py-1 bg-gray-200 text-gray-800 text-sm rounded-md">${kw}</span>`
        ).join('');
      } else {
        keywordsHTML = '<span>Tidak ada kata kunci tersedia</span>';
      }
      
      // Tampilkan waktu pemrosesan dari backend
      content.innerHTML = `
        <div class="mb-4 bg-blue-50 p-3 rounded-md text-blue-700 text-sm">
          <p><i class="far fa-clock mr-1"></i> Waktu pemrosesan: ${formatTime(result.processingTime)}</p>
        </div>
        
        <div class="mt-4">
          <h4 class="text-sm font-medium text-gray-700 uppercase tracking-wide">Deskripsi</h4>
          <div class="mt-2 p-4 bg-gray-50 rounded-md">
            <p class="text-gray-800">${result.description || 'Tidak ada deskripsi tersedia'}</p>
            <button class="copy-desc-btn mt-3 inline-flex items-center text-sm text-primary-600 hover:text-primary-800" data-text="${result.description || ''}">
              <i class="far fa-copy mr-1"></i> Salin
            </button>
          </div>
        </div>
        
        <div class="mt-6">
          <h4 class="text-sm font-medium text-gray-700 uppercase tracking-wide">Kata Kunci</h4>
          <div class="mt-2 p-4 bg-gray-50 rounded-md">
            <div class="flex flex-wrap gap-2">
              ${keywordsHTML}
            </div>
            <button class="copy-keywords-btn mt-3 inline-flex items-center text-sm text-primary-600 hover:text-primary-800" data-text="${result.keywords ? result.keywords.join(', ') : ''}">
              <i class="far fa-copy mr-1"></i> Salin Semua
            </button>
          </div>
        </div>
      `;
    }
    
    tabContents.appendChild(content);
    
    // Update preview badge to completed
    updatePreviewBadge(result.filename, 'completed', false, result.processingTime);
  });
  
  // Highlight preview pertama secara default
  if (results.length > 0 && results[0].filename) {
    setTimeout(() => {
      highlightMatchingPreview(results[0].filename);
    }, 100);
  }
  
  // Lanjutkan kode yang sudah ada di fungsi displayMultipleResults...
  
  // Gunakan waktu total dari server jika tersedia
  const serverTotalTime = totalProcessingTime || (results[0] && results[0].total_processing_time);
  const actualTotalTime = serverTotalTime || (Date.now() - processingStartTime);
  
  // Tambahkan ringkasan waktu total
  const summaryDiv = document.createElement('div');
  summaryDiv.className = 'mt-6 p-4 bg-green-50 rounded-md text-green-800';
  summaryDiv.innerHTML = `
    <h4 class="text-sm font-medium uppercase tracking-wide">Ringkasan Pemrosesan</h4>
    <div class="mt-2">
      <p><i class="fas fa-check-circle mr-1"></i> Total gambar diproses: ${results.length}</p>
      <p><i class="far fa-clock mr-1"></i> Total waktu: ${formatTime(actualTotalTime)}</p>
      <p><i class="fas fa-tachometer-alt mr-1"></i> Rata-rata per gambar: ${formatTime(Math.round(actualTotalTime / results.length))}</p>
    </div>
  `;
  
  tabContents.appendChild(summaryDiv);
  
  // Add tab switching functionality
  document.querySelectorAll('[data-tab]').forEach(tab => {
    tab.addEventListener('click', function() {
      // Remove active class from all tabs
      document.querySelectorAll('[data-tab]').forEach(t => {
        t.classList.remove('border-b-2', 'border-primary-600', 'text-primary-700');
      });
      
      // Add active class to clicked tab
      this.classList.add('border-b-2', 'border-primary-600', 'text-primary-700');
      
      // Hide all tab contents
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
      });
      
      // Show selected tab content
      document.getElementById(this.getAttribute('data-tab')).classList.remove('hidden');
      
      // Highlight matching preview
      const filename = this.getAttribute('data-filename');
      if (filename) {
        highlightMatchingPreview(filename);
      }
    });
  });
  
  // Add tab switching functionality
  document.querySelectorAll('[data-tab]').forEach(tab => {
    tab.addEventListener('click', function() {
      // Remove active class from all tabs
      document.querySelectorAll('[data-tab]').forEach(t => {
        t.classList.remove('border-b-2', 'border-primary-600', 'text-primary-700');
      });
      
      // Add active class to clicked tab
      this.classList.add('border-b-2', 'border-primary-600', 'text-primary-700');
      
      // Hide all tab contents
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
      });
      
      // Show selected tab content
      document.getElementById(this.getAttribute('data-tab')).classList.remove('hidden');
    });
  });
  
  // Function to handle loading images
  document.querySelectorAll('.tab-image-preview img').forEach(img => {
    const previewContainer = img.parentElement;
    previewContainer.classList.add('loading');
    
    img.onload = () => {
      previewContainer.classList.remove('loading');
    };
    
    img.onerror = () => {
      previewContainer.classList.remove('loading');
      previewContainer.innerHTML = '<p class="text-xs text-red-500 p-2">Gagal memuat preview</p>';
    };
  });
  
  // Add copy functionality
  document.querySelectorAll('.copy-desc-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      copyToClipboard(this.getAttribute('data-text'));
      showNotification('Deskripsi disalin ke clipboard!');
    });
  });
  
  document.querySelectorAll('.copy-keywords-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      copyToClipboard(this.getAttribute('data-text'));
      showNotification('Kata kunci disalin ke clipboard!');
    });
  });
  
  // Reset UI
  multiBtnText.textContent = 'Upload & Analyze All Images';
  multiBtnLoader.classList.add('hidden');
  analyzeMultipleBtn.disabled = false;
  
  multiResults.classList.remove('hidden');
  
  // Scroll to results
  multiResults.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  
  showNotification(`Berhasil menganalisis ${results.length} gambar dalam ${formatTime(actualTotalTime)}!`);
}

// Copy functionality - Single mode
copyDesc.addEventListener('click', function() {
  copyToClipboard(desc.textContent);
  showNotification('Deskripsi disalin ke clipboard!');
});

copyKeywords.addEventListener('click', function() {
  const keywords = Array.from(keywordsContainer.querySelectorAll('span'))
    .map(span => span.textContent)
    .join(', ');
  copyToClipboard(keywords);
  showNotification('Kata kunci disalin ke clipboard!');
});

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).catch(err => {
    console.error('Tidak dapat menyalin teks: ', err);
  });
}

// Notification
function showNotification(message, type = 'success') {
  const notificationText = document.getElementById('notification-text');
  notification.className = 'fixed bottom-4 right-4 p-4 rounded-md shadow-lg flex items-center transition-transform duration-300 z-50';
  
  if (type === 'success') {
    notification.classList.add('bg-green-100', 'text-green-700');
    notification.querySelector('i').className = 'fas fa-check-circle mr-2';
  } else {
    notification.classList.add('bg-red-100', 'text-red-700');
    notification.querySelector('i').className = 'fas fa-exclamation-circle mr-2';
  }
  
  notificationText.textContent = message;
  notification.style.transform = 'translateY(0)';
  
  setTimeout(() => {
    notification.style.transform = 'translateY(100%)';
  }, 3000);
}

// Tambahkan event listener untuk preview gambar agar bisa diklik
document.addEventListener('DOMContentLoaded', function() {
  // Delegasi event untuk handle klik pada preview gambar
  multiPreviewContainer.addEventListener('click', function(e) {
    const previewWrapper = e.target.closest('.preview-wrapper');
    if (!previewWrapper) return;
    
    const filename = previewWrapper.getAttribute('data-filename');
    if (!filename) return;
    
    // Temukan tab yang sesuai dengan filename dan klik
    const matchingTab = [...document.querySelectorAll('[data-tab]')].find(
      tab => tab.getAttribute('data-filename') === filename
    );
    
    if (matchingTab) {
      matchingTab.click();
    }
  });
  
});




