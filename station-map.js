console.log("Bài 48 - station-map.js đang chạy");

const stationMap =
    L.map("stationMap").setView(
        [21.0, 105.8],
        9
    );

L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        attribution:
            "&copy; OpenStreetMap contributors"
    }
).addTo(stationMap);

console.log("Bản đồ trạm đã được tạo");


// ========================================
// BÀI 48.4 - LẤY 14 TRẠM TỪ API
// ========================================

fetch("http://localhost:3000/api/stations")
    .then(response => response.json())
    .then(data => {

        console.log(
            "Bài 48.4 - Dữ liệu 14 trạm:",
            data
        );

        console.log(
            "Số trạm:",
            data.length
        );

        data.forEach(station => {

            const marker =
                L.marker([
                    station.lat,
                    station.lon
                ]).addTo(stationMap);


            // Tên trạm khi rê chuột
            marker.bindTooltip(
                station.stationName
            );


            // ========================================
            // BÀI 48.5 - POPUP THÔNG TIN TRẠM
            // ========================================

            const latestRecord =
                station.history &&
                station.history.length > 0
                    ? station.history[station.history.length - 1]
                    : null;

            let updateText = "--";

            if (latestRecord) {

                const latestDate =
                    new Date(latestRecord.timestamp);

                const day =
                    String(latestDate.getDate())
                        .padStart(2, "0");

                const month =
                    String(latestDate.getMonth() + 1)
                        .padStart(2, "0");

                const year =
                    latestDate.getFullYear();

                updateText =
                    latestRecord.time
                    + " ngày "
                    + day
                    + "/"
                    + month
                    + "/"
                    + year;
            }


            const popupContent =
                `
                <strong>${station.stationName}</strong>
                <br>
                Mực nước:
                ${station.waterLevel} m
                <br>
                Trạng thái:
                ${station.status}
                <br>
                Cập nhật:
                ${updateText}
                `;


            marker.bindPopup(
                popupContent
            );

        });

        console.log(
            "Đã đưa các trạm lên bản đồ"
        );

    })
    .catch(error => {

        console.error(
            "Lỗi API bản đồ trạm:",
            error
        );

    });

