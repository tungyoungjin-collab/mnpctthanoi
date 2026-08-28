// ========================================
// LẤY SỐ NGÀY CHO BIỂU ĐỒ
// ========================================
 
function getChartDays() {
    const timeFilter = document.getElementById("timeFilter");
    const value = timeFilter ? timeFilter.value : "24";
 
    switch (value) {
        case "24": return 1;
        case "7": return 7;
        case "15": return 15;
        case "30": return 30;
        default: return 1;
    }
}
 
 
// ========================================
// LẤY MỐC THỜI GIAN CHUNG 14 TRẠM
// ========================================
 
function getCommonLatestTime(data) {
    const timestamps = data
        .flatMap(station => station.history ? station.history.map(item => item.timestamp) : [])
        .map(timestamp => new Date(timestamp).getTime())
        .filter(time => !isNaN(time));
 
    if (timestamps.length === 0) {
        return null;
    }
 
    return new Date(Math.max(...timestamps));
}
 
 
// ========================================
// TẠO DỮ LIỆU BIỂU ĐỒ
// ========================================
 
function createChartData(data, history, days) {
 
    const latestTime = getCommonLatestTime(data);
 
    if (!latestTime) {
        return {
            labels: [],
            values: [],
            history24h: [],
            timeline: [],
            latestTime: null,
            startTime: null
        };
    }
 
    const startTime = new Date(latestTime.getTime() - days * 24 * 60 * 60 * 1000);
 
    const history24h = (history || []).filter(item => {
        const itemTime = new Date(item.timestamp);
        return itemTime >= startTime && itemTime <= latestTime;
    });
 
    // TẠO TIMELINE: mỗi giờ tròn
    const timeline = [];
    const firstHour = new Date(startTime);
    firstHour.setMinutes(0);
    firstHour.setSeconds(0);
    firstHour.setMilliseconds(0);
 
    const totalHours = days * 24;
 
    for (let i = 0; i <= totalHours; i++) {
        const time = new Date(firstHour);
        time.setHours(firstHour.getHours() + i);
        timeline.push(time);
    }
 
    // TẠO LABELS: DD/MM HH:00
    const labels = timeline.map(date => {
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const hours = String(date.getHours()).padStart(2, "0");
        return `${day}/${month} ${hours}:00`;
    });
 
    // TẠO MAP DỮ LIỆU: chỉ nhận BẢN GHI ĐÚNG HH:00
    const historyMap = new Map();
 
    history24h.forEach(item => {
        const date = new Date(item.timestamp);
 
        // Chỉ nhận phút 00
        if (date.getMinutes() !== 0) {
            return;
        }
 
        // Key: YYYY-MM-DD HH:00
        const key =
            date.getFullYear() + "-" +
            String(date.getMonth() + 1).padStart(2, "0") + "-" +
            String(date.getDate()).padStart(2, "0") + " " +
            String(date.getHours()).padStart(2, "0") + ":00";
 
        historyMap.set(key, item.waterLevel);
    });
 
    // GÁN MỰC NƯỚC VÀO TIMELINE: null nếu thiếu → GAP
    const values = timeline.map(time => {
        const key =
            time.getFullYear() + "-" +
            String(time.getMonth() + 1).padStart(2, "0") + "-" +
            String(time.getDate()).padStart(2, "0") + " " +
            String(time.getHours()).padStart(2, "0") + ":00";
 
        return historyMap.has(key) ? historyMap.get(key) : null;
    });
 
    return {
        labels,
        values,
        history24h,
        timeline,
        latestTime,
        startTime
    };
}
 
 
// ========================================
// LẦN TẢI ĐẦU TIÊN
// ========================================
 
fetch("/api/stations")
    .then(response => response.json())
    .then(data => {
 
        if (window.showAllStationsOnWindy) {
            window.showAllStationsOnWindy(data);
        } else {
            window.pendingWindyStations = data;
        }
 
        const stationSelect = document.getElementById("station");
        const timeFilter = document.getElementById("timeFilter");
 
        const currentStation = data.find(station => station.stationId === stationSelect.value);
 
        // Cập nhật thông tin trạm
        document.getElementById("station-name").textContent = currentStation.stationName;
        document.getElementById("water-level").textContent = currentStation.waterLevel + " m";
        document.getElementById("station-status").textContent = currentStation.status;
 
        // Cập nhật thời gian
        const latestRecord = currentStation.history[currentStation.history.length - 1];
        const latestDate = new Date(latestRecord.timestamp);
        const day = String(latestDate.getDate()).padStart(2, "0");
        const month = String(latestDate.getMonth() + 1).padStart(2, "0");
        const year = latestDate.getFullYear();
 
        document.getElementById("update-time").textContent =
            "Cập nhật lúc: " + latestRecord.time + " ngày " + day + "/" + month + "/" + year;
 
        // Cập nhật trạng thái màu sắc
        const statusElement = document.getElementById("station-status");
        statusElement.className = "";
        if (currentStation.status === "Đang hoạt động") {
            statusElement.classList.add("status-normal");
        } else if (currentStation.status === "Cảnh báo") {
            statusElement.classList.add("status-warning");
        } else {
            statusElement.classList.add("status-danger");
        }
 
        // Tạo biểu đồ
        const chartData = createChartData(data, currentStation.history, getChartDays());
 
        const ctx = document.getElementById("waterChart");
        window.waterChart = new Chart(ctx, {
            type: "line",
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: "Mực nước (m)",
                    data: chartData.values,
                    borderWidth: 2,
                    tension: 0.3,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    spanGaps: false
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: "Diễn biến mực nước - Trạm " + currentStation.stationName
                    }
                },
                scales: {
                    y: {
                        title: { display: true, text: "Mực nước (m)" }
                    },
                    x: {
                        title: { display: true, text: "Thời gian" },
                        ticks: { autoSkip: true, maxTicksLimit: 12 }
                    }
                }
            }
        });
 
        // ========================================
        // ĐỔI BIỂU ĐỒ KHI CHỌN KHOẢNG THỜI GIAN
        // ========================================
 
        timeFilter.addEventListener("change", function () {
            const days = getChartDays();
            const currentStation = data.find(station => station.stationId === stationSelect.value);
 
            if (!currentStation) {
                console.error("Không tìm thấy trạm:", stationSelect.value);
                return;
            }
 
            const chartData = createChartData(data, currentStation.history, days);
 
            window.waterChart.data.labels = chartData.labels;
            window.waterChart.data.datasets[0].data = chartData.values;
            window.waterChart.options.plugins.title.text = "Diễn biến mực nước - Trạm " + currentStation.stationName;
            window.waterChart.update();
        });
 
        // ========================================
        // ĐỔI BIỂU ĐỒ KHI CHỌN TRẠM KHÁC
        // ========================================
 
        stationSelect.addEventListener("change", function () {
            const selectedStation = stationSelect.value;
            const currentStation = data.find(station => station.stationId === selectedStation);
 
            if (!currentStation) {
                console.error("Không tìm thấy trạm:", selectedStation);
                return;
            }
 
            // Cập nhật biểu đồ
            const chartData = createChartData(data, currentStation.history || [], getChartDays());
 
            waterChart.data.labels = chartData.labels;
            waterChart.data.datasets[0].data = chartData.values;
            waterChart.options.plugins.title.text = "Diễn biến mực nước - Trạm " + currentStation.stationName;
            waterChart.update();
 
            // Cập nhật mực nước
            document.getElementById("water-level").textContent = currentStation.waterLevel + " m";
 
            // Cập nhật trạng thái
            document.getElementById("station-status").textContent = currentStation.status;
 
            const statusElement = document.getElementById("station-status");
            statusElement.className = "";
            if (currentStation.status === "Đang hoạt động") {
                statusElement.classList.add("status-normal");
            } else if (currentStation.status === "Cảnh báo") {
                statusElement.classList.add("status-warning");
            } else {
                statusElement.classList.add("status-danger");
            }
 
            // Cập nhật tên trạm
            document.getElementById("station-name").textContent = currentStation.stationName;
 
            // Cập nhật thời gian
            const latestUpdateRecord = currentStation.history[currentStation.history.length - 1];
            const latestDate = new Date(latestUpdateRecord.timestamp);
            const day = String(latestDate.getDate()).padStart(2, "0");
            const month = String(latestDate.getMonth() + 1).padStart(2, "0");
            const year = latestDate.getFullYear();
 
            document.getElementById("update-time").textContent =
                "Cập nhật lúc: " + latestUpdateRecord.time + " ngày " + day + "/" + month + "/" + year;
 
            // Chuyển bản đồ Windy
            if (window.windyMap) {
                window.windyMap.map.setView([currentStation.lat, currentStation.lon], 12);
            }
        });
 
    })
    .catch(error => {
        console.error("Lỗi API:", error);
    });
 
 
// ========================================
// TỰ ĐỘNG CẬP NHẬT DỮ LIỆU MỖI 60 GIÂY
// ========================================
 
setInterval(() => {
    fetch("/api/stations")
        .then(response => response.json())
        .then(data => {
 
            const stationSelect = document.getElementById("station");
            const currentStation = data.find(station => station.stationId === stationSelect.value);
 
            if (!currentStation) {
                console.error("Không tìm thấy trạm:", stationSelect.value);
                return;
            }
 
            // Cập nhật mực nước
            document.getElementById("water-level").textContent = currentStation.waterLevel + " m";
            document.getElementById("station-status").textContent = currentStation.status;
 
            // Cập nhật thời gian
            const latestRecord = currentStation.history[currentStation.history.length - 1];
            const latestDate = new Date(latestRecord.timestamp);
            const day = String(latestDate.getDate()).padStart(2, "0");
            const month = String(latestDate.getMonth() + 1).padStart(2, "0");
            const year = latestDate.getFullYear();
 
            document.getElementById("update-time").textContent =
                "Cập nhật lúc: " + latestRecord.time + " ngày " + day + "/" + month + "/" + year;
 
            // Cập nhật biểu đồ
            const chartData = createChartData(data, currentStation.history, getChartDays());
 
            window.waterChart.data.labels = chartData.labels;
            window.waterChart.data.datasets[0].data = chartData.values;
            window.waterChart.options.plugins.title.text = "Diễn biến mực nước - Trạm " + currentStation.stationName;
            window.waterChart.update();
 
        })
        .catch(error => {
            console.error("Lỗi cập nhật API:", error);
        });
 
}, 60000);