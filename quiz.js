// URL Web App đã cung cấp
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbx9Kc3Zv77wTfBSQcAGbtaZykSDIIMi1bW3CDRHHs6xJu_AWlRPw1UBaaR2G5ROY3F9/exec'; 

// --- CÁC BIẾN TOÀN CỤC ---
let studentDataCache = []; // Bộ đệm dữ liệu học sinh từ students.json
let currentQuiz = [];
let correctAnswers = {}; // Lưu trữ đáp án đúng (từ server)
let quizDuration = 15 * 60; // 15 phút (900 giây)
let timerInterval;
let studentInfo = {}; // Thông tin học sinh sau khi xác thực

// --- HÀM TIỆN ÍCH: GỌI API GAS ---
async function callApi(params, method = 'GET', payload = null) {
    const url = new URL(GAS_WEB_APP_URL);
    
    // Thêm các tham số vào URL
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

    const options = {
        method: method,
        mode: 'cors', // Bắt buộc cho giao tiếp cross-origin
    };

    if (method === 'POST' && payload) {
        options.headers = {
            'Content-Type': 'application/json',
        };
        options.body = JSON.stringify(payload);
    }
    
    const response = await fetch(url.toString(), options);

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Chuyển đổi phản hồi thành JSON
    const data = await response.json();
    
    // Kiểm tra lỗi từ server (nếu GAS trả về lỗi trong JSON)
    if (data.error) {
        throw new Error(data.error);
    }

    return data;
}

// --- LOGIC TẢI DỮ LIỆU HỌC SINH (CLIENT-SIDE) ---

// Tải dữ liệu học sinh từ students.json
async function loadStudentData() {
    document.getElementById('status-message').textContent = 'Đang tải dữ liệu học sinh...';
    try {
        const response = await fetch('./students.json');
        if (!response.ok) {
            throw new Error(`Failed to load students.json: ${response.statusText}`);
        }
        
        // Cập nhật bộ đệm và chuẩn hóa tên trường (Lop/LƠP, HoTen/TEN)
        const rawData = await response.json();
        studentDataCache = rawData.map(student => ({
            Khoi: String(student.Khối || student.Khoi),
            Lop: String(student.LƠP || student.Lop), 
            STT: String(student.STT),
            HoTen: String(student.TEN || student.HoTen),
            IDHS: student.IDHS || null 
        }));

        document.getElementById('status-message').textContent = 'Vui lòng chọn thông tin để bắt đầu.';
        
        // Sau khi tải dữ liệu, thiết lập các sự kiện và tải danh sách bài kiểm tra
        setupEventListeners();
        loadTestList(); 
        
    } catch (error) {
        document.getElementById('status-message').textContent = 'Lỗi tải dữ liệu học sinh (JSON). Vui lòng kiểm tra file students.json.';
        console.error("Error loading student data:", error);
    }
}

// --- LOGIC TRA CỨU HỌC SINH (CLIENT-SIDE) ---

// 1. Tải danh sách Lớp dựa trên Khối (Client-side)
function loadClassList() {
    const khoi = document.getElementById('khoi').value;
    const lopSelect = document.getElementById('lop');
    
    // Reset select box
    lopSelect.innerHTML = '<option value="">Chọn Lớp</option>';
    lopSelect.disabled = true;

    if (!khoi || studentDataCache.length === 0) {
        lopSelect.innerHTML = '<option value="">Chọn Khối trước</option>';
        return;
    }
    
    try {
        // Lọc dữ liệu theo Khối và trích xuất các lớp duy nhất
        const filteredStudents = studentDataCache.filter(row => row.Khoi === khoi);
        const uniqueClasses = [...new Set(filteredStudents.map(row => row.Lop))];

        if (uniqueClasses.length > 0) {
            uniqueClasses.sort(); // Sắp xếp theo tên lớp
            uniqueClasses.forEach(lop => {
                const option = document.createElement('option');
                option.value = lop;
                option.textContent = lop;
                lopSelect.appendChild(option);
            });
            lopSelect.disabled = false;
        } else {
            lopSelect.innerHTML = '<option value="">Không có lớp nào trong dữ liệu</option>';
        }
        
    } catch (error) {
        lopSelect.innerHTML = '<option value="">Lỗi xử lý danh sách lớp</option>';
        console.error("Error processing class list:", error);
    }
    
    lookupName();
}

// 2. Tra cứu tên học sinh theo Khối, Lớp, STT (Client-side)
function lookupName() {
    const khoi = document.getElementById('khoi').value;
    const lop = document.getElementById('lop').value; 
    const stt = document.getElementById('stt').value;
    const hotenInput = document.getElementById('hoten');
    hotenInput.value = '';
    document.getElementById('status-message').textContent = '';
    studentInfo = {}; // Reset thông tin học sinh
    
    if (khoi && lop && stt && studentDataCache.length > 0) {
        // Tìm kiếm trong bộ nhớ đệm
        const foundStudent = studentDataCache.find(row => 
            String(row.Khoi) === khoi && row.Lop === lop && String(row.STT) === stt
        );

        if (foundStudent) {
            hotenInput.value = foundStudent.HoTen;
            document.getElementById('status-message').textContent = `Chào mừng ${foundStudent.HoTen}!`;
            
            // Lưu thông tin học sinh để gửi lên server sau
            studentInfo = { 
                Khoi: foundStudent.Khoi, 
                Lop: foundStudent.Lop, 
                STT: foundStudent.STT, 
                HoTen: foundStudent.HoTen, 
                IDHS: foundStudent.IDHS || 'N/A' 
            };
        } else {
            hotenInput.value = 'Học sinh không hợp lệ';
            document.getElementById('status-message').textContent = 'Khối, Lớp, hoặc STT không đúng.';
        }
    } else if (khoi && lop && stt) {
        hotenInput.value = 'Đang chờ dữ liệu tải...';
    }
}

// --- LOGIC TẢI BÀI KIỂM TRA (SERVER-SIDE GAS) ---

// Tải danh sách bài kiểm tra đang 'open' từ GAS
async function loadTestList() {
    const baiktSelect = document.getElementById('baikt_id');
    baiktSelect.innerHTML = '<option value="">Đang tải...</option>';
    
    try {
        const data = await callApi({ action: 'getTests' });
        
        const openTests = data.filter(test => test.TrangThai === 'open');

        if (openTests.length === 0) {
            baiktSelect.innerHTML = '<option value="">Không có bài kiểm tra nào đang mở</option>';
        } else {
            baiktSelect.innerHTML = '';
            
            openTests.forEach(test => {
                const option = document.createElement('option');
                option.value = test.BaiKT_ID;
                option.textContent = test.TenBaiKT;
                baiktSelect.appendChild(option);
            });
            
            // Tự động chọn bài đầu tiên
            baiktSelect.value = openTests[0].BaiKT_ID;
        }

    } catch (error) {
        baiktSelect.innerHTML = '<option value="">Lỗi tải danh sách bài kiểm tra</option>';
        document.getElementById('status-message').textContent = `Lỗi tải danh sách bài kiểm tra: ${error.message}`;
        console.error("Error loading tests:", error);
    }
}

// --- LOGIC BẮT ĐẦU VÀ LÀM BÀI ---

// Hàm bắt đầu bài kiểm tra
async function startQuiz() {
    const baiktId = document.getElementById('baikt_id').value;
    const statusMessage = document.getElementById('status-message');

    if (!studentInfo.HoTen || studentInfo.HoTen.includes('Học sinh không hợp lệ')) {
        statusMessage.textContent = 'Vui lòng xác thực thông tin học sinh hợp lệ trước khi bắt đầu.';
        return;
    }
    
    if (!baiktId) {
        statusMessage.textContent = 'Vui lòng chọn Bài Kiểm Tra.';
        return;
    }
    
    statusMessage.textContent = 'Đang tạo đề thi ngẫu nhiên...';

    try {
        const data = await callApi({ 
            action: 'getQuiz',
            Khoi: studentInfo.Khoi,
            BaiKT_ID: baiktId
        });
        
        if (data.questions.length === 0) {
             throw new Error("Quiz configuration found, but no questions were selected. Check KhoiX and CauHinh sheets.");
        }
        
        currentQuiz = data.questions;
        correctAnswers = {}; // Lưu trữ đáp án đúng

        // TẠO CẤU TRÚC ĐÁP ÁN ĐÚNG TỪ DỮ LIỆU ĐÃ MÃ HÓA
        currentQuiz.forEach(q => {
            // q.Correct_Answer là đáp án đúng (A, B, C, D) được server gửi về
            correctAnswers[q.ID] = q.Correct_Answer; 
            delete q.Correct_Answer; // Loại bỏ đáp án đúng khỏi đối tượng câu hỏi
        });

        document.getElementById('info-form').style.display = 'none';
        document.getElementById('quiz-header').style.display = 'block';
        document.getElementById('quiz-container').style.display = 'block';
        statusMessage.textContent = '';
        
        renderQuiz();
        startTimer();

    } catch (error) {
        statusMessage.textContent = `Lỗi tải đề thi: ${error.message}`;
        console.error("Error loading quiz:", error);
    }
}

// Vẽ giao diện câu hỏi
function renderQuiz() {
    const container = document.getElementById('quiz-container');
    container.innerHTML = '';
    
    currentQuiz.forEach((q, index) => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question';
        questionDiv.id = `q-${q.ID}`;

        // Tiêu đề câu hỏi
        const qTitle = document.createElement('h4');
        qTitle.textContent = `Câu ${index + 1}. (ID: ${q.ID}) - ${q.Tieu_de}`;
        questionDiv.appendChild(qTitle);
        
        // Khu vực lựa chọn
        const optionsDiv = document.createElement('div');
        optionsDiv.className = 'options';
        
        // Danh sách các lựa chọn (A, B, C, D)
        const optionKeys = ['Dap_an_A', 'Dap_an_B', 'Dap_an_C', 'Dap_an_D'];

        optionKeys.forEach((key, opIndex) => {
            if (q[key]) { // Chỉ hiển thị nếu có nội dung
                const optionLabel = document.createElement('label');
                const optionChar = String.fromCharCode(65 + opIndex); // A, B, C, D
                
                optionLabel.innerHTML = `
                    <input type="radio" name="question-${q.ID}" value="${optionChar}">
                    ${optionChar}. ${q[key]}
                `;
                optionsDiv.appendChild(optionLabel);
            }
        });
        
        questionDiv.appendChild(optionsDiv);
        container.appendChild(questionDiv);
    });

    // Thêm nút nộp bài
    const submitButton = document.createElement('button');
    submitButton.textContent = 'NỘP BÀI KIỂM TRA';
    submitButton.onclick = submitQuiz;
    container.appendChild(submitButton);
}

// --- LOGIC ĐỒNG HỒ ĐẾM NGƯỢC ---
function startTimer() {
    clearInterval(timerInterval);
    const timerDisplay = document.getElementById('timer');
    
    timerInterval = setInterval(() => {
        const minutes = Math.floor(quizDuration / 60);
        const seconds = quizDuration % 60;
        
        timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        if (quizDuration <= 0) {
            clearInterval(timerInterval);
            alert("Hết giờ làm bài! Hệ thống sẽ tự động nộp bài.");
            submitQuiz(true); // Tự động nộp khi hết giờ
        }
        
        quizDuration--;
    }, 1000);
}

// --- LOGIC NỘP BÀI & GHI KẾT QUẢ (SERVER-SIDE GAS) ---
async function submitQuiz(isTimeout = false) {
    clearInterval(timerInterval);
    document.getElementById('quiz-container').innerHTML = 'Đang chấm bài và lưu kết quả...';
    document.getElementById('quiz-header').style.display = 'none';

    let totalCorrect = 0;
    const totalQuestions = currentQuiz.length;
    const studentAnswers = {};
    
    // 1. CHẤM ĐIỂM (CLIENT-SIDE)
    currentQuiz.forEach(q => {
        const selected = document.querySelector(`input[name="question-${q.ID}"]:checked`);
        const studentChoice = selected ? selected.value : null;
        const correctChoice = correctAnswers[q.ID];
        
        studentAnswers[q.ID] = { 
            answered: studentChoice, 
            correct: correctChoice, 
            is_correct: studentChoice === correctChoice 
        };
        
        if (studentChoice === correctChoice) {
            totalCorrect++;
        }
    });

    const diemSo = (totalCorrect / totalQuestions) * 10;
    
    // 2. CHUẨN BỊ DỮ LIỆU ĐỂ GHI
    const submissionData = {
        ...studentInfo,
        BaiKT_ID: document.getElementById('baikt_id').value,
        DiemSo: diemSo.toFixed(2), // Làm tròn 2 chữ số thập phân
        TongSoCauDung: totalCorrect,
        TongSoCau: totalQuestions,
        ChiTietDapAn: studentAnswers
    };
    
    // 3. GHI KẾT QUẢ LÊN GOOGLE SHEET QUA GAS (POST)
    try {
        const result = await callApi({ action: 'submitQuiz' }, 'POST', submissionData);
        
        let finalMessage = `
            <h3>🎉 NỘP BÀI THÀNH CÔNG!</h3>
            <hr>
            <p>Họ Tên: ${studentInfo.HoTen}</p>
            <p>Bài Kiểm Tra: ${document.getElementById('baikt_id').options[document.getElementById('baikt_id').selectedIndex].textContent}</p>
            <p>Tổng số câu: ${totalQuestions}</p>
            <p style="font-size: 1.2em; color: green; font-weight: bold;">Số câu trả lời đúng: ${totalCorrect}</p>
            <p style="font-size: 1.5em; color: #007bff; font-weight: bold;">ĐIỂM SỐ: ${submissionData.DiemSo}</p>
        `;

        if (isTimeout) {
            finalMessage += '<p style="color: red;">(Bài nộp tự động do hết giờ)</p>';
        }

        document.getElementById('quiz-container').innerHTML = finalMessage;

    } catch (error) {
        document.getElementById('quiz-container').innerHTML = `
            <h3>LỖI LƯU KẾT QUẢ!</h3>
            <p>Vui lòng chụp ảnh màn hình này và báo cáo cho giáo viên.</p>
            <p>Lỗi: ${error.message}</p>
            <p>Điểm số đã tính (Chưa được lưu): ${submissionData.DiemSo}</p>
        `;
        console.error("Error submitting quiz:", error);
    }
}

// --- THIẾT LẬP SỰ KIỆN ---
function setupEventListeners() {
    document.getElementById('khoi').addEventListener('change', loadClassList);
    document.getElementById('lop').addEventListener('change', lookupName);
    document.getElementById('stt').addEventListener('input', lookupName);
}

// Tải dữ liệu học sinh khi DOM được tải xong
document.addEventListener('DOMContentLoaded', loadStudentData);

// Gán hàm bắt đầu bài kiểm tra vào cửa sổ để HTML có thể gọi
window.startQuiz = startQuiz;