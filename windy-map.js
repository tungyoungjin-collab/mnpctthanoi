// ========================================
// KHỞI TẠO WINDY MAP FORECAST
// ========================================

const WINDY_OPTIONS = {
    key: "pSuKAvMD6CdAQreYFmlHd2whzEpYn54x",
    lat: 21.0,
    lon: 105.8,
    zoom: 8
};

// Ngưỡng cảnh báo mực nước (m) theo từng trạm
const warningLevels = {
    F01391: { level1: 15, level2: 16, level3: 17 },
    F01559: { level1: 9.5, level2: 10.5, level3: 11.5 },
    F01812: { level1: 7.2, level2: 8.2, level3: 9.1 },
    F01771: { level1: 9.6, level2: 10.6, level3: 11.6 },
    F01540: { level1: 6.8, level2: 7.6, level3: 8.4 },
    F01254: { level1: 6.4, level2: 7.2, level3: 8 },
    F01532: { level1: 5.5, level2: 6.5, level3: 7.5 },
    F01223: { level1: 6, level2: 7, level3: 8 },
    F01215: { level1: 6, level2: 7, level3: 8 },
    F01247: { level1: 6, level2: 6.5, level3: 7 },
    F01905: { level1: 4, level2: 4.4, level3: 4.7 },
    F02031: { level1: 4, level2: 4.4, level3: 4.7 },
    F01238: { level1: 5, level2: 6, level3: 6.5 },
    F01828: { level1: 16, level2: 17, level3: 18 }
};

// Xác định mức cảnh báo (0-3) dựa trên ngưỡng của từng trạm
function getWarningLevel(station) {
    const waterLevel = Number(station.waterLevel);
    const thresholds = warningLevels[station.stationId];

    if (!thresholds) {
        return { level: 0, text: "", color: "green" };
    }

    if (waterLevel >= thresholds.level3) {
        return { level: 3, text: "Báo động 3", color: "red" };
    }

    if (waterLevel >= thresholds.level2) {
        return { level: 2, text: "Báo động 2", color: "orange" };
    }

    if (waterLevel >= thresholds.level1) {
        return { level: 1, text: "Báo động 1", color: "yellow" };
    }

    return { level: 0, text: "", color: "green" };
}

// Icon marker hình giọt nước, đổi màu theo mức cảnh báo
function createWarningMarkerIcon(color) {
    return L.divIcon({
        className: "warning-marker",
        html: `<div style="
            width: 22px;
            height: 22px;
            background: ${color};
            border: 2px solid white;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            box-shadow: 0 0 5px rgba(0,0,0,0.6);
        "></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -28]
    });
}

function buildStationPopup(station, warning) {
    const warningText = warning.level > 0
        ? `<br><b style="color:${warning.color};">${warning.text}</b>`
        : "";

    return (
        `<b>${station.stationName}</b><br>` +
        `Mã trạm: ${station.stationId}<br>` +
        `<b style="color:${warning.color};">` +
        `Mực nước: ${Number(station.waterLevel).toFixed(2)} m</b>` +
        warningText +
        `<br>Trạng thái: ${station.status}`
    );
}

windyInit(WINDY_OPTIONS, windyAPI => {

    window.windyMap = windyAPI;

    // Hiển thị toàn bộ trạm lên bản đồ Windy
    window.showAllStationsOnWindy = function (data) {

        data.forEach(station => {

            const warning = getWarningLevel(station);

            const marker = L.marker(
                [station.lat, station.lon],
                { icon: createWarningMarkerIcon(warning.color) }
            ).addTo(windyAPI.map);

            marker.bindPopup(buildStationPopup(station, warning));
        });

        console.log("Đã hiển thị", data.length, "trạm trên Windy");
    };

    // Nếu dữ liệu trạm đã được lấy trước khi Windy sẵn sàng thì hiển thị luôn
    if (window.pendingWindyStations) {
        window.showAllStationsOnWindy(window.pendingWindyStations);
        window.pendingWindyStations = null;
    }

});

// ========================================
// QUẢN LÝ MARKER TRÊN WINDY
// ========================================

window.windyMarkers = {};

window.addWindyStationMarker = function (stationId, stationName, lat, lon, waterLevel, status) {

    if (!window.windyMap) {
        console.log("Windy chưa sẵn sàng");
        return;
    }

    const marker = L.marker([lat, lon]).addTo(window.windyMap.map);

    marker.bindPopup(
        `<b>${stationName}</b><br>` +
        `Mực nước: ${waterLevel} m<br>` +
        `Trạng thái: ${status}`
    );

    window.windyMarkers[stationId] = marker;
};
