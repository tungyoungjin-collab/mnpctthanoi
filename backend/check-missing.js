const db = require("better-sqlite3")("hydro.db");

const rows = db.prepare(`
    SELECT station_id, station_name, timestamp
    FROM water_levels
    ORDER BY station_id, timestamp
`).all();

const groups = {};

for (const row of rows) {

    if (!groups[row.station_id]) {
        groups[row.station_id] = [];
    }

    groups[row.station_id].push(row);
}


for (const stationId in groups) {

    const data = groups[stationId];

    let missing = [];

    for (let i = 1; i < data.length; i++) {

        const previous =
            new Date(data[i - 1].timestamp);

        const current =
            new Date(data[i].timestamp);

        const diffMinutes =
            (current - previous) / 60000;


        if (diffMinutes > 10) {

            for (
                let minute = 10;
                minute < diffMinutes;
                minute += 10
            ) {

                missing.push(
                    new Date(
                        previous.getTime()
                        + minute * 60000
                    ).toISOString()
                );

            }

        }

    }


    console.log(
        stationId,
        "|",
        data[0].station_name,
        "| thiếu:",
        missing.length,
        "mốc"
    );


    if (missing.length > 0) {

        console.log(
            missing
        );

    }

}