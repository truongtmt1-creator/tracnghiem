// ======================================================================
// quiz.js - LOGIC XỬ LÝ BÀI KIỂM TRA
// ======================================================================

// --- 1. CẤU HÌNH VÀ BIẾN TOÀN CỤC ---

// 🔥 URL CỦA GOOGLE APPS SCRIPT WEB APP
// BẮT BUỘC phải là URL mới nhất sau khi bạn Deploy New Version
const GAS_WEB_APP_URL = 'Yhttps://script.google.com/macros/s/AKfycbx9Kc3Zv77wTfBSQcAGbtaZykSDIIMi1bW3CDRHHs6xJu_AWlRPw1UBaaR2G5ROY3F9/exec'; 

// ID Bài kiểm tra mặc định (đã thống nhất)
const DEFAULT_BAIKT_ID = 'KT7GK1'; 

let studentsData = []; // Dữ liệu danh sách học sinh
let studentInfo = { Khoi: '7', Lop: '', STT: 0, HoTen: '' }; // Thông tin học sinh đang làm bài
let currentQuiz = []; // Mảng chứa câu hỏi đã được tải từ server
let correctAnswers = {}; // Lưu trữ đáp án đúng (từ server)
let timerInterval; // Biến điều khiển đồng hồ

// --- 2. HÀM TIỆN ÍCH BẢO MẬT VÀ CHUNG ---

// 🔥 Hàm Mã hóa ROT13 (đơn giản, đủ để chống nhìn lướt source code)
function rot13(str) {
  return str.replace(/[a-zA-Z]/g, function(c) {
    return String.fromCharCode((c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26);
  });
}

// 🔥 Hàm Xáo trộn mảng (Fisher-Yates)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Hàm gọi API (GET/POST)
async function callApi(data, method = 'GET') {
    const url = new URL(GAS_WEB_APP_URL);

    if (method === 'GET') {
        // Gửi tham số qua query string
        Object.keys(data).forEach(key => url.searchParams.append(key, data[key]));
        
        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
        
    } else if (method === 'POST') {
        // Gửi tham số qua body (dùng cho việc ghi dữ liệu)
        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        // Apps Script trả về JSON dưới dạng text/html, cần xử lý
        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch (e) {
            throw new Error(`Failed to parse response: ${text}`);
        }
    }
}


// --- 3. LOGIC XÁC THỰC HỌC SINH ---

// Tải dữ liệu học sinh từ students.json
async function loadStudentData() {
    try {
        const response = await fetch('./students.json');
        if (!response.ok) throw new Error('Không thể tải file students.json');
        
        studentsData = await response.json();
        
        // Lọc danh sách lớp từ dữ liệu (Chỉ lấy Khối 7)
        const classes = [...new Set(studentsData.filter(s => s.Khối === '7').map(s => s.LƠP))].sort();
        const lopSelect = document.getElementById('lop');
        lopSelect.innerHTML = '<option value="">--- Chọn Lớp ---</option>';
        classes.forEach(lop => {
            const option = document.createElement('option');
            option.value = lop;
            option.textContent = lop;
            lopSelect.appendChild(option);
        });

        // Thiết lập các event listener
        document.getElementById('lop').addEventListener('change', updateStudentInfo);
        document.getElementById('stt').addEventListener('input', updateStudentInfo);
        
    } catch (error) {
        console.error("Lỗi tải dữ liệu học sinh:", error);
        document.getElementById('lop').innerHTML = '<option value="">Lỗi tải dữ liệu</option>';
    }
}

// Cập nhật thông tin học sinh dựa trên STT và Lớp
function updateStudentInfo() {
    const lop = document.getElementById('lop').value;
    const stt = parseInt(document.getElementById('stt').value);
    const hotenInput = document.getElementById('hoten');
    
    studentInfo.Lop = lop;
    studentInfo.STT = stt;

    if (lop && stt > 0) {
        const student = studentsData.find(s => 
            s.Khối === studentInfo.Khoi && s.LƠP === lop && s.STT === stt
        );
        
        if (student) {
            studentInfo.HoTen = student.TEN;
            hotenInput.value = student.TEN;
            document.getElementById('status-message').textContent = '';
        } else {
            studentInfo.HoTen = `Học sinh không hợp lệ - ${lop}-${stt}`;
            hotenInput.value = 'Học sinh không hợp lệ';
            document.getElementById('status-message').textContent = 'Không tìm thấy học sinh với STT này trong lớp đã chọn.';
        }
    } else {
        studentInfo.HoTen = '';
        hotenInput.value = '';
        document.getElementById('status-message').textContent = '';
    }
}


// --- 4. LOGIC BÀI KIỂM TRA CHÍNH ---

// Hàm bắt đầu bài kiểm tra
async function startQuiz() {
    const statusMessage = document.getElementById('status-message');
    const baiktId = DEFAULT_BAIKT_ID; 

    // 1. Kiểm tra xác thực học sinh
    if (!studentInfo.HoTen || studentInfo.HoTen.includes('Học sinh không hợp lệ')) {
        statusMessage.textContent = 'Vui lòng xác thực thông tin học sinh hợp lệ trước khi bắt đầu.';
        return;
    }
    
    statusMessage.textContent = 'Đang tạo đề thi ngẫu nhiên...';

    try {
        // 2. Gọi API để lấy đề thi
        const data = await callApi({ 
            action: 'getQuiz',
            Khoi: studentInfo.Khoi,
            BaiKT_ID: baiktId
        });
        
        // 3. Kiểm tra số lượng câu hỏi trả về
        if (data.questions.length === 0) {
             throw new Error("Quiz configuration found, but no questions were selected.");
        }

        // 4. XỬ LÝ VÀ HIỂN THỊ CẢNH BÁO TỪ SERVER
        let hasWarning = false;
        if (data.warnings && data.warnings.length > 0) {
            hasWarning = true;
            const warningMessage = data.warnings.join('<br>');
            const totalQuestions = data.questions.length;
            
            // Hiển thị cảnh báo trực tiếp trên form và dừng lại
            statusMessage.innerHTML = `
                <div style="background-color: #fff3cd; color: #856404; padding: 15px; border-radius: 5px; margin-top: 10px; text-align: left;">
                    ⚠️ CẢNH BÁO THIẾU CÂU HỎI (${data.warnings.length} chủ đề):<br>
                    <strong>Chỉ tạo được ${totalQuestions} câu hỏi.</strong>
                    <hr style="border-top: 1px solid #ffeeba;">
                    ${warningMessage}
                    <hr style="border-top: 1px solid #ffeeba;">
                    <p style="font-size: 0.9em; margin: 0;">Vui lòng kiểm tra và bổ sung câu hỏi trong Google Sheet.</p>
                </div>
            `;
            return; // Dừng lại nếu có cảnh báo để giáo viên xử lý
        } else {
            statusMessage.textContent = ''; 
        }

        // 5. Khởi tạo dữ liệu bài thi
        currentQuiz = data.questions;
        correctAnswers = {}; 

        // TẠO CẤU TRÚC ĐÁP ÁN ĐÚNG TỪ DỮ LIỆU ĐÃ MÃ HÓA
        currentQuiz.forEach(q => {
            correctAnswers[q.ID] = q.Correct_Answer; 
            delete q.Correct_Answer; 
        });

        // 6. Chuyển đổi giao diện sang chế độ làm bài
        document.getElementById('info-form').style.display = 'none';
        document.getElementById('quiz-header').style.display = 'block';
        document.getElementById('quiz-container').style.display = 'block';
        
        // 7. Bắt đầu hiển thị câu hỏi và đồng hồ
        renderQuiz();
        // Giả sử bài thi là 15 phút (900 giây)
        startTimer(900); 

    } catch (error) {
        // Xử lý lỗi kết nối hoặc lỗi từ server
        statusMessage.innerHTML = `<span style="color:red; font-weight:bold;">❌ Lỗi tải đề thi:</span> ${error.message}`;
        console.error("Error loading quiz:", error);
    }
}

// Vẽ giao diện câu hỏi (CÓ XÁO TRỘN ĐÁP ÁN VÀ MÃ HÓA, KHÔNG HIỂN THỊ A, B, C, D)
function renderQuiz() {
    const container = document.getElementById('quiz-container');
    container.innerHTML = ''; 

    // 🔥 XÁO TRỘN THỨ TỰ CÂU HỎI
    currentQuiz = shuffleArray(currentQuiz); 

    currentQuiz.forEach((q, index) => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question';
        questionDiv.id = `q-${q.ID}`;

        // 1. Tiêu đề câu hỏi (Mã hóa trước khi thêm vào DOM)
        const qTitle = document.createElement('h4');
        qTitle.textContent = `Câu ${index + 1}. ${rot13(q.Tieu_de)}`; 
        questionDiv.appendChild(qTitle);
        
        // 2. Xử lý các lựa chọn
        const optionsDiv = document.createElement('div');
        optionsDiv.className = 'options';
        
        const optionKeys = ['Dap_an_A', 'Dap_an_B', 'Dap_an_C', 'Dap_an_D'];
        
        let options = optionKeys.map(key => ({
            key: key,
            content: q[key]
        })).filter(opt => opt.content);

        // 🔥 XÁO TRỘN THỨ TỰ ĐÁP ÁN
        options = shuffleArray(options); 

        options.forEach((opt, opIndex) => {
            const optionLabel = document.createElement('label');
            const optionChar = String.fromCharCode(65 + opIndex); // A, B, C, D mới (chỉ dùng làm value)
            
            const encodedContent = rot13(opt.content); 
            
            // 🔥 KHÔNG HIỂN THỊ KÝ TỰ A, B, C, D TRÊN GIAO DIỆN
            optionLabel.innerHTML = `
                <input type="radio" 
                       name="question-${q.ID}" 
                       value="${optionChar}" 
                       data-original-key="${opt.key}" > 
                ${encodedContent}
            `;
            optionsDiv.appendChild(optionLabel);
        });
        
        questionDiv.appendChild(optionsDiv);
        container.appendChild(questionDiv);
    });

    // Thêm nút nộp bài
    const submitButton = document.createElement('button');
    submitButton.textContent = 'NỘP BÀI KIỂM TRA';
    submitButton.onclick = () => submitQuiz(false);
    container.appendChild(submitButton);
}

// Hàm xử lý nộp bài
async function submitQuiz(isTimeout = false) {
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    
    // 1. CHẤM ĐIỂM (CLIENT-SIDE) VÀ TẠO DỮ LIỆU LOG
    let totalCorrect = 0;
    const studentAnswers = {}; 

    currentQuiz.forEach(q => {
        const selectedRadio = document.querySelector(`input[name="question-${q.ID}"]:checked`);
        
        const studentChoiceChar = selectedRadio ? selectedRadio.value : null; 
        const originalKey = selectedRadio ? selectedRadio.getAttribute('data-original-key') : null; 
        const correctChoice = correctAnswers[q.ID]; 
        
        let isCorrect = false;
        if (originalKey) {
            // Chuyển Dap_an_A -> A, Dap_an_B -> B để so sánh với correctChoice
            const studentOriginalChoiceChar = originalKey.substring(7); 
            isCorrect = (studentOriginalChoiceChar === correctChoice);
        }
        
        studentAnswers[q.ID] = { 
            answered: studentChoiceChar, // Đáp án học sinh chọn (vị trí A/B/C/D mới)
            original_key: originalKey, // Khóa gốc của đáp án đó (Dap_an_A, Dap_an_B, ...)
            correct: correctChoice, // Đáp án đúng gốc (A, B, C, D)
            is_correct: isCorrect,
            question_content: rot13(q.Tieu_de) // Nội dung câu hỏi đã giải mã
        };
        
        if (isCorrect) {
            totalCorrect++;
        }
    });
    
    // 2. TẠO DỮ LIỆU ĐỂ GỬI LÊN SERVER
    const resultData = {
        action: 'logResult', // Action để lưu kết quả
        StudentInfo: studentInfo, 
        TotalCorrect: totalCorrect,
        TotalQuestions: currentQuiz.length,
        Answers: studentAnswers, 
        CompletionTime: new Date().toLocaleString('vi-VN')
    };

    // 3. GỬI KẾT QUẢ ĐẾN GOOGLE APPS SCRIPT
    const submitContainer = document.getElementById('quiz-container');
    submitContainer.innerHTML = '<h3>Đang nộp bài và lưu kết quả... Vui lòng chờ.</h3>';

    try {
        const response = await callApi(resultData, 'POST'); // Dùng POST cho việc ghi dữ liệu

        // 4. HIỂN THỊ THÔNG BÁO THÀNH CÔNG VÀ KẾT THÚC BÀI THI (KHÔNG HIỂN THỊ ĐIỂM)
        document.getElementById('quiz-header').style.display = 'none';
        submitContainer.innerHTML = `
            <div style="text-align: center; padding: 50px;">
                <h3 style="color: #28a745;">✅ ĐÃ HOÀN TẤT BÀI THI</h3>
                <p>Bài làm của em đã được lưu lại thành công. Giáo viên sẽ thông báo kết quả sau.</p>
                <button onclick="window.location.reload()" style="width: auto; padding: 10px 20px; background-color: #007bff;">
                    Quay lại trang chủ
                </button>
            </div>
        `;

    } catch (error) {
        submitContainer.innerHTML = `
            <div style="text-align: center; padding: 30px;">
                <h3 style="color: red;">❌ LỖI NỘP BÀI</h3>
                <p>Không thể lưu kết quả. Vui lòng chụp màn hình lỗi và báo cáo cho giáo viên.</p>
                <p style="font-size: 0.9em;">Chi tiết lỗi: ${error.message}</p>
                <button onclick="window.location.reload()" style="width: auto; padding: 10px 20px; background-color: #007bff;">
                    Thử lại
                </button>
            </div>
        `;
        console.error("Error submitting quiz:", error);
    }
}


// Hàm đếm ngược thời gian
function startTimer(durationInSeconds) {
    let timer = durationInSeconds;
    const display = document.getElementById('timer');

    timerInterval = setInterval(() => {
        let minutes = parseInt(timer / 60, 10);
        let seconds = parseInt(timer % 60, 10);

        minutes = minutes < 10 ? "0" + minutes : minutes;
        seconds = seconds < 10 ? "0" + seconds : seconds;

        display.textContent = minutes + ":" + seconds;

        if (--timer < 0) {
            clearInterval(timerInterval);
            display.textContent = "HẾT GIỜ";
            submitQuiz(true); // Tự động nộp bài khi hết giờ
        }
    }, 1000);
}

// --- 5. BẢO MẬT & KHỞI TẠO ---

// 🔥 VÔ HIỆU HÓA CHUỘT PHẢI
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    alert("Tính năng chuột phải đã bị vô hiệu hóa để bảo mật bài thi.");
});

// 🔥 Vô hiệu hóa phím F12/Inspect
document.onkeydown = function(e) {
    // F12 || Ctrl+Shift+I || Ctrl+Shift+J (Mac: Cmd+Option+I/J)
    if(e.key === "F12" || (e.ctrlKey && e.shiftKey && e.key === "I") || (e.ctrlKey && e.shiftKey && e.key === "J") || (e.metaKey && e.altKey && e.key === "I")) {
        e.preventDefault();
        alert("Thao tác kiểm tra mã nguồn đã bị vô hiệu hóa.");
        return false;
    }
}

// Khởi tạo khi trang tải xong
window.onload = loadStudentData;