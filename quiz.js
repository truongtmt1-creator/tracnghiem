// URL Web App đã cung cấp
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbx9Kc3Zv77wTfBSQcAGbtaZykSDIIMi1bW3CDRHHs6xJu_AWlRPw1UBaaR2G5ROY3F9/exec'; 

// Biến lưu trữ dữ liệu chính
let quizData = []; // Lưu trữ câu hỏi và đáp án đúng (đã được ẩn danh)
let studentInfo = {}; // Lưu trữ thông tin học sinh sau khi xác thực
let studentAnswers = {}; // Lưu trữ câu trả lời của học sinh
let selectedBaiKT_ID = ''; // Lưu ID bài kiểm tra được chọn/tự động gán

// Biến cho chức năng đếm ngược
let timeLeft = 0;
let timerInterval = null; 
const QUIZ_DURATION_MINUTES = 15; // Mặc định: 15 phút làm bài

// --- KHỞI TẠO VÀ BẢO MẬT ---

// 1. CHẶN PHÍM PHẢI CHUỘT
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    alert("Tính năng chuột phải đã bị vô hiệu hóa để bảo mật bài kiểm tra.");
});

// 2. TẢI DỮ LIỆU KHI TẢI TRANG HOẶC CÓ THAY ĐỔI TRÊN FORM
document.addEventListener('DOMContentLoaded', loadTestList);

// Bắt sự kiện thay đổi Khối để tải lại Lớp và Bài kiểm tra
document.getElementById('khoi').addEventListener('change', () => {
    loadTestList();      // Tải danh sách Bài KT
    loadClassList();     // Tải danh sách Lớp MỚI
    lookupName();        // Thử tra cứu tên (nếu STT đã điền)
});

// Bắt sự kiện thay đổi Lớp và STT để tra cứu tên
document.getElementById('lop').addEventListener('change', lookupName); // Dùng 'change' cho select
document.getElementById('stt').addEventListener('input', lookupName);

// --- HÀM GỌI API ---

async function callApi(params, method = 'GET', payload = null) {
    const url = new URL(GAS_WEB_APP_URL);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    
    const options = { method: method };
    if (payload && method === 'POST') {
        options.headers = { 'Content-Type': 'application/json' };
        options.body = JSON.stringify(payload);
    }

    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

// --- LOGIC XÁC THỰC VÀ TẢI DỮ LIỆU FORM ---

async function loadTestList() {
    const khoi = document.getElementById('khoi').value;
    const testSelectGroup = document.getElementById('baikt-select-group');
    const testSelect = document.getElementById('baikt_id');
    selectedBaiKT_ID = ''; 

    testSelect.innerHTML = '<option value="">Đang tải...</option>'; 
    testSelectGroup.style.display = 'block';

    if (!khoi) {
        testSelect.innerHTML = '<option value="">Vui lòng chọn Khối</option>';
        return;
    }

    try {
        const tests = await callApi({ action: 'getTests' });
        
        const filteredTests = tests.filter(t => t.TrangThai.toLowerCase() === 'open' && String(t.Khoi) === khoi);
        
        if (filteredTests.length === 0) {
            testSelect.innerHTML = '<option value="">Không có bài kiểm tra đang mở cho khối này</option>';
            testSelectGroup.style.display = 'none';
        } else if (filteredTests.length === 1) {
            // TỰ ĐỘNG CHỌN BÀI KHI CHỈ CÓ 1
            const test = filteredTests[0];
            selectedBaiKT_ID = test.BaiKT_ID;
            testSelect.innerHTML = `<option value="${test.BaiKT_ID}">${test.TenBaiKT} (Tự động chọn)</option>`;
            testSelect.disabled = true; 
            document.getElementById('status-message').textContent = `Đã chọn bài: ${test.TenBaiKT}.`;
            testSelectGroup.style.display = 'block';
        } else {
            // CÓ NHIỀU BÀI: Yêu cầu học sinh chọn
            testSelect.innerHTML = '<option value="">Chọn Bài Kiểm Tra</option>';
            testSelect.disabled = false;
            filteredTests.forEach(test => {
                const option = document.createElement('option');
                option.value = test.BaiKT_ID;
                option.textContent = `${test.TenBaiKT} (${test.BaiKT_ID})`;
                testSelect.appendChild(option);
            });
            testSelectGroup.style.display = 'block';
        }
    } catch (error) {
        document.getElementById('status-message').textContent = 'Lỗi khi tải danh sách bài kiểm tra.';
        console.error("Error loading tests:", error);
    }
}

async function loadClassList() {
    const khoi = document.getElementById('khoi').value;
    const lopSelect = document.getElementById('lop');
    
    // Reset select box
    lopSelect.innerHTML = '<option value="">Đang tải...</option>';
    lopSelect.disabled = true;

    if (!khoi) {
        lopSelect.innerHTML = '<option value="">Chọn Khối trước</option>';
        return;
    }
    
    try {
        const result = await callApi({ action: 'getClassesByBlock', Khoi: khoi });
        const classes = result.classes;

        lopSelect.innerHTML = '<option value="">Chọn Lớp</option>'; // Lựa chọn mặc định
        
        if (classes.length > 0) {
            classes.forEach(lop => {
                const option = document.createElement('option');
                option.value = lop;
                option.textContent = lop;
                lopSelect.appendChild(option);
            });
            lopSelect.disabled = false;
        } else {
            lopSelect.innerHTML = '<option value="">Không có lớp nào trong CSDL</option>';
        }
    } catch (error) {
        lopSelect.innerHTML = '<option value="">Lỗi tải danh sách lớp</option>';
        console.error("Error loading class list:", error);
    }
    
    // Sau khi tải lớp, thử tra cứu tên (nếu STT đã được điền)
    lookupName();
}

async function lookupName() {
    const khoi = document.getElementById('khoi').value;
    const lop = document.getElementById('lop').value; // Lấy từ select
    const stt = document.getElementById('stt').value;
    const hotenInput = document.getElementById('hoten');
    hotenInput.value = '';
    document.getElementById('status-message').textContent = '';
    
    if (khoi && lop && stt) {
        try {
            const data = await callApi({ action: 'lookupStudent', Khoi: khoi, Lop: lop, STT: stt });

            if (data.HoTen && data.HoTen !== 'Không tìm thấy học sinh') {
                hotenInput.value = data.HoTen;
                document.getElementById('status-message').textContent = `Chào mừng ${data.HoTen}!`;
                studentInfo = { Khoi: data.Khoi, Lop: data.Lop, STT: data.STT, HoTen: data.HoTen, IDHS: data.IDHS };
            } else {
                hotenInput.value = 'Học sinh không hợp lệ';
                document.getElementById('status-message').textContent = 'Khối, Lớp, hoặc STT không đúng.';
                studentInfo = {};
            }
        } catch (error) {
            document.getElementById('status-message').textContent = 'Lỗi kết nối tra cứu tên.';
            console.error("Error looking up name:", error);
            studentInfo = {};
        }
    }
}

// --- LOGIC TẢI ĐỀ THI VÀ HIỂN THỊ ---

async function startQuiz() {
    let baikt_id = selectedBaiKT_ID || document.getElementById('baikt_id').value;

    if (!studentInfo.HoTen || !baikt_id) {
        document.getElementById('status-message').textContent = 'Vui lòng điền đầy đủ thông tin và chọn bài kiểm tra hợp lệ.';
        return;
    }

    document.getElementById('status-message').textContent = 'Đang tải đề thi... Vui lòng chờ.';
    
    try {
        const params = {
            action: 'getQuiz',
            Khoi: studentInfo.Khoi,
            BaiKT_ID: baikt_id 
        };
        const result = await callApi(params);
        
        if (result.error) {
             document.getElementById('status-message').textContent = 'Lỗi tải đề thi: ' + result.error;
             return;
        }

        quizData = result.questions; 
        
        if (quizData.length === 0) {
            document.getElementById('status-message').textContent = 'Không tìm thấy câu hỏi nào theo cấu hình.';
            return;
        }

        // Ẩn form xác thực, hiển thị khu vực làm bài và đồng hồ
        document.getElementById('info-form').style.display = 'none';
        document.getElementById('status-message').textContent = `Bắt đầu làm bài: ${baikt_id} (${quizData.length} câu)`;
        document.getElementById('quiz-container').style.display = 'block';
        document.getElementById('quiz-header').style.display = 'block';

        renderQuiz();
        startTimer(); // Bắt đầu đếm ngược

    } catch (error) {
        document.getElementById('status-message').textContent = 'Lỗi kết nối hoặc tải đề thi.';
        console.error("Error starting quiz:", error);
    }
}

function renderQuiz() {
    const container = document.getElementById('quiz-container');
    container.innerHTML = '<h3>Phiếu Trắc Nghiệm</h3>';

    quizData.forEach((question, index) => {
        const questionHtml = `
            <div class="question" data-id="${question.ID}">
                <p><strong>Câu ${index + 1}</strong> (${question.MucDo.toUpperCase()} - ${question.ChuDe}): ${question.Cau_hoi}</p>
                ${question.Hinh_anh ? `<img src="${question.Hinh_anh}" style="max-width: 100%; height: auto; margin-bottom: 10px;">` : ''}
                
                <div class="options">
                    ${renderOption(question.ID, 'A', question.Dap_an_A)}
                    ${renderOption(question.ID, 'B', question.Dap_an_B)}
                    ${renderOption(question.ID, 'C', question.Dap_an_C)}
                    ${renderOption(question.ID, 'D', question.Dap_an_D)}
                </div>
            </div>
        `;
        container.innerHTML += questionHtml;
    });

    container.innerHTML += '<button onclick="submitQuiz(false)" style="margin-top: 20px; background-color: green;">Nộp Bài Kiểm Tra</button>';
}

function renderOption(questionId, optionKey, optionText) {
    const fullId = `${questionId}_${optionKey}`;
    return `
        <input type="radio" id="${fullId}" name="q_${questionId}" value="${optionKey}" 
               onchange="saveAnswer('${questionId}', '${optionKey}')">
        <label for="${fullId}">${optionKey}. ${optionText}</label>
    `;
}

function saveAnswer(questionId, answer) {
    studentAnswers[questionId] = answer;
}

// --- LOGIC ĐẾM NGƯỢC THỜI GIAN ---

function startTimer() {
    timeLeft = QUIZ_DURATION_MINUTES * 60; 
    updateTimerDisplay(); 
    
    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            alert("Hết giờ! Bài kiểm tra sẽ được tự động nộp.");
            submitQuiz(true); // Tự động nộp bài khi hết giờ
        }
    }, 1000); 
}

function updateTimerDisplay() {
    const timerElement = document.getElementById('timer');
    if (!timerElement) return;

    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;

    const formattedTime = 
        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    timerElement.textContent = formattedTime;

    if (timeLeft <= 60) {
        timerElement.style.color = 'darkred';
    } else {
        timerElement.style.color = 'red';
    }
}

// --- LOGIC NỘP BÀI ---

async function submitQuiz(isAutoSubmit = false) {
    // Xác nhận thủ công
    if (!isAutoSubmit) {
        if (timeLeft <= 0) {
            alert("Đã hết giờ làm bài.");
            return;
        }
        if (!confirm("Bạn có chắc chắn muốn nộp bài? Bài làm sẽ được gửi đi và không thể chỉnh sửa!")) {
            return;
        }
    }
    
    // Dừng đồng hồ
    if (timerInterval) {
        clearInterval(timerInterval);
    }

    document.getElementById('status-message').textContent = 'Đang chấm điểm và gửi kết quả... Vui lòng không đóng trình duyệt.';

    let correctCount = 0;
    const totalQuestions = quizData.length;
    
    // Chấm điểm
    quizData.forEach(q => {
        const studentAns = studentAnswers[q.ID] || ''; 
        // So sánh với đáp án đúng đã được gửi về (Correct_Answer)
        if (studentAns.toUpperCase() === q.Correct_Answer.toUpperCase()) {
            correctCount++;
        }
    });

    const diemSo = (correctCount / totalQuestions) * 10; 

    // Chuẩn bị dữ liệu gửi POST
    const resultPayload = {
        Khoi: studentInfo.Khoi,
        Lop: studentInfo.Lop,
        STT: studentInfo.STT,
        HoTen: studentInfo.HoTen,
        BaiKT_ID: document.getElementById('baikt_id').value,
        DiemSo: diemSo.toFixed(2), 
        TongSoCauDung: correctCount,
        TongSoCau: totalQuestions,
        ChiTietDapAn: studentAnswers 
    };

    // Gửi dữ liệu bằng phương thức POST
    try {
        const result = await callApi({}, 'POST', resultPayload);

        if (result.success) {
            document.getElementById('quiz-container').innerHTML = `
                <h2>🎉 HOÀN THÀNH BÀI LÀM 🎉</h2>
                <p>Họ tên: **${studentInfo.HoTen}**</p>
                <p>Bài kiểm tra: **${resultPayload.BaiKT_ID}**</p>
                <p>Số câu đúng: **${correctCount}/${totalQuestions}**</p>
                <p>Điểm số: **${resultPayload.DiemSo}**</p>
                <p style="color: green;">Kết quả đã được ghi nhận thành công!</p>
            `;
            document.getElementById('quiz-header').style.display = 'none'; // Ẩn đồng hồ
        } else {
            throw new Error(result.message || "Lỗi không xác định khi lưu kết quả.");
        }

    } catch (error) {
        document.getElementById('status-message').textContent = 'LỖI NỘP BÀI: Vui lòng liên hệ giáo viên. ' + error.message;
        console.error("Lỗi khi nộp bài:", error);
    }
}