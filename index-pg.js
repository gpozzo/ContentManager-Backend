const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());

const sqlstring = require('sqlstring');

const { Client } = require('pg');

const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'postgres',
    password: 'oppinuj3',
    port: 5432,
});

client.connect();

app.get('/events', (req, res) => {
    let sql = ` SELECT  id,
                        CONCAT(CASE
                            WHEN (year = '' OR year IS NULL OR type = 'birth' OR type = 'death') THEN CONCAT(to_char(now(), 'YYYY'), '-', month, '-', day)
                            ELSE CONCAT(year, '-', month, '-', day)
                        END, 'T10:00:00') "start",
                        type,
                        title,
                        CONCAT('#calendar?eventId=', id) "url"
                FROM	eventcalendar
                WHERE   1 = 1`;

    if(req.query) {
        let keyword = req.query.keyword;
        if(keyword) {
            keyword = keyword.trim();
            sql = sql + `   AND (title LIKE '%${keyword}%'
                            OR title LIKE '${keyword}%'
                            OR title LIKE '%${keyword}')`;
        }

        let type = req.query.type;
        if(type) sql = sql + ` AND type in (${type})`;

        let period = req.query.period;
        if(period) {
            let startDate = period.substring(0, 10);
            let startDateYear = startDate.slice(-4);
            let startDateMonth = startDate.substr(3,2)
            let startDateDay = startDate.substr(0,2);
            startDate = startDateYear + '-' + startDateMonth + '-' + startDateDay;

            let endDate = period.substring(13, 23);
            let endDateYear = endDate.slice(-4);
            let endDateMonth = endDate.substr(3,2);
            let endDateDay = endDate.substr(0,2);
            endDate = endDateYear + '-' + endDateMonth + '-' + endDateDay;

            //sql = sql + ` AND ( TO_DATE(CONCAT(year, '-', month, '-', day)) between '${startDate}' and '${endDate}'`;

            // Workaround for retrieving recurrent events
            //startDate = '2020' + '-' + startDateMonth + '-' + startDateDay;
            //endDate = '2020' + '-' + endDateMonth + '-' + endDateDay;
            //sql = sql + `OR ( (year = '' OR type = 'birth' OR type = 'death') AND DATE(CONCAT('2020', '-', month, '-', day)) between '${startDate}' and '${endDate}' ))`;
        }
    }

    sql = sql + ` ORDER BY 2`;

    client.query(sql, (err, result) => {
        if (err) console.error(err);
        var output = result.rows;
        client.end();
        return res.json(output);
    });
});

app.get('/eventDetails', (req, res) => {
    if(req.query.id) {
        let sql = ` SELECT  *
                    FROM	eventcalendar
                    WHERE   id = ${req.query.id}`;

        client.query(sql, (err, res) => {
            if (err) console.error(err);
            res.json(res.rows);
            client.end();
        });
    }
});

app.delete('/events', (req, res) => {
    if(req.query.id) {
        let sql = `delete from eventCalendar where id = ${req.query.id};`;

        client.query(sql, (err, res) => {
            if (err) console.error(err);
            res.json(res.rows);
            client.end();
        });
    }
});

app.post('/events', (req, res) => {
    let title = sqlstring.escape(req.body.title);
    let day = req.body.day;
    let month = req.body.month;
    let year = req.body.year;
    let type = req.body.type;
    let recurrent = req.body.recurrent;
    if(!recurrent) recurrent = 'N';

    if((title) && (day) && (month)) {
        let sql = `INSERT INTO eventcalendar (title, type, day, month, year, recurrent) VALUES (${title}, '${type}', '${day}', '${month}', '${year}', '${recurrent}');`;

        client.query(sql, (err, res) => {
            var output = 'success';
            if (err) { output = err; }            
            res.send(output);;
        });

    }
});

app.listen(3333);