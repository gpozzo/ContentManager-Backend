const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());

const sqlstring = require('sqlstring');
const mysql = require('mysql');
const conn = mysql.createConnection({ host: "localhost", user: "root", password: "", database:"instagram", multipleStatements: true });

app.use('/public', express.static('public'));

// Multer setup
const storage = multer.diskStorage({
    destination: function(req, file, cb) { cb(null, 'public/'); },
    filename: function(req, file, cb) { cb(null, Date.now() + path.extname(file.originalname)); }
});

const imageFilter = function(req, file, cb) {
    if (!file.originalname.match(/\.(jpg|JPG|jpeg|JPEG|png|PNG|gif|GIF|webp|WEBP)$/)) {
        req.fileValidationError = 'Only image files are allowed!';
        return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
};

/** @TODO Implement fuzzy search option **/
/*const Fuse = require('fuse.js');
const options = { keys: [ "description", "title" ] }; // The keys to search into
const fuse = new Fuse(result, options); // Result is the json with data
var data = fuse.search(filter); // Filter is the string of keywords*/

app.get('/images', (req, res) => {
    if((req.query.keywords) || (req.query.id)) {
        let sql =   `select   *
                    from    instagram.photos WHERE 1 `;

        if(req.query.id) {
            sql = sql + ` AND id = ${req.query.id}`;
        } else if(req.query.keywords) {
            let filter = req.query.keywords.split(" ");

            filter.forEach(value => {
                value = value.replace(/[aàáâãäå]/g, "(a|à|á|ã|ä|å|â)");
                value = value.replace(/[eèéêë]/g, "(e|è|é|ê|ë)");
                value = value.replace(/[iìíîï]/g, "(i|ì|í|î|ï)");
                value = value.replace(/[oòóôõö]/g, "(o|ò|ó|ô|õ|ö)");
                value = value.replace(/[uùúûü]/g, "(u|ù|ú|û|ü)");
                value = value.replace(/[cç]/g, "(c|ç)");
                value = value.replace(/[nñ]/g, "(n|ñ)");
    
                if(value.startsWith("-")) {
                    value = value.slice(1);
                    sql = `${sql} AND (description NOT REGEXP '\\\\b${value}\\\\b' and title NOT REGEXP '\\\\b${value}\\\\b')`;
                } else {
                    sql = `${sql} AND (description REGEXP '\\\\b${value}\\\\b' OR title REGEXP '\\\\b${value}\\\\b')`;
                }
            });
        }

        sql = sql + ' ORDER BY id LIMIT 300;';
        conn.query(sql, function (err, result) {
            if (err) throw err;
            return res.json(result);
        });
    } else {
        return res.json('');
    }
});

app.get('/events', (req, res) => {
    let sql = ` SELECT  id,
                        CONCAT(CASE
                            WHEN (year = '' OR year IS NULL OR type = 'birth' OR type = 'death') AND DATEDIFF(STR_TO_DATE(CONCAT(DATE_FORMAT(now(), '%Y'), '-', month, '-', day), '%Y-%m-%d'), NOW()) >= 0 THEN CONCAT(DATE_FORMAT(now(), '%Y'), '-', month, '-', day)
                            WHEN (year = '' OR year IS NULL OR type = 'birth' OR type = 'death') AND DATEDIFF(STR_TO_DATE(CONCAT(DATE_FORMAT(now(), '%Y'), '-', month, '-', day), '%Y-%m-%d'), NOW()) < 0 THEN CONCAT(DATE_FORMAT(DATE_ADD(now(), INTERVAL +1 YEAR), '%Y'), '-', month, '-', day)
                            ELSE CONCAT(year, '-', month, '-', day)
                        END, 'T10:00:00') as 'start',
                        type,
                        title,
                        CONCAT('#calendar?eventId=', id) as 'url'
                FROM	eventcalendar
                WHERE   1`;

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

            sql = sql + ` AND ( DATE(CONCAT(year, '-', month, '-', day)) between '${startDate}' and '${endDate}'`;

            // Workaround for retrieving recurrent events
            startDate = '2020' + '-' + startDateMonth + '-' + startDateDay;
            endDate = '2020' + '-' + endDateMonth + '-' + endDateDay;
            sql = sql + `OR ( (year = '' OR type = 'birth' OR type = 'death') AND DATE(CONCAT('2020', '-', month, '-', day)) between '${startDate}' and '${endDate}' ))`;
        }
    }

    sql = sql + ` ORDER BY 2`;

    conn.query(sql, function (err, result) {
        if (err) throw err;
        return res.json(result);
    });
});

app.get('/eventDetails', (req, res) => {
    if(req.query.id) {
        let sql = ` SELECT  *
                    FROM	eventcalendar
                    WHERE   id = ${req.query.id}`;

        conn.query(sql, function (err, result) {
            if (err) throw err;
            return res.json(result);
        });
    }
});

app.delete('/events', (req, res) => {
    if(req.query.id) {
        let sql = `delete from instagram.eventCalendar where id = ${req.query.id};`;

        conn.query(sql, function (err, result) {
            if (err) throw err;
            return res.json(result);
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
        let sql = `INSERT INTO instagram.eventcalendar (title, type, day, month, year, recurrent) VALUES (${title}, '${type}', '${day}', '${month}', '${year}', '${recurrent}');`;

        conn.query(sql, function (err, result) {
            var output = 'success';
            if (err) { output = err; }            
            res.send(output);
        });
    }
});

app.post('/upload', (req, res) => {
    let upload = multer({ storage: storage, fileFilter: imageFilter }).array('imageUploadInput', 30);

    upload(req, res, function(err) {
        let files = req.files;

        if (req.fileValidationError) { return res.send(req.fileValidationError); }
        else if ((!files) || (files.length <= 0)) { return res.send('Please select an image to upload'); }
        else if (err instanceof multer.MulterError) { return res.send(err); }
        else if (err) { return res.send(err); }

        let output = [];
        files.forEach(file => {
            output.push( { originalname: file.originalname, filename: file.filename } );
        });

        return res.json(output);
    });
});

app.get('/people', (req, res) => {
    let peopleId = req.query.peopleId;
    let array = [];

    let sql = 'SELECT name FROM instagram.people WHERE 1';
    if(peopleId) sql = sql + ` AND peopleId=${peopleId}`;
    sql = sql + ` ORDER BY 1;`;

    conn.query(sql, function (err, result) {
        if (err) throw err;
        return res.json(result);
    });
});

app.post('/images', (req, res) => {
    var sql = '';

    req.body.forEach(photo => {
        let peopleInThePhoto = photo.people.join(';');
        sql = sql + `INSERT INTO instagram.photos ( path, title, date, description, author, people )
        VALUES ( "${photo.path}", "${photo.title}", "${photo.date}", "${photo.description}", "${photo.author}", "${peopleInThePhoto}" ); `;

        photo.people.forEach(person => { sql = sql + `INSERT INTO instagram.people VALUES ( '${person}' ) ON DUPLICATE KEY UPDATE name = name; ` });
    });

    conn.query(sql, function (err, result) {
        if (err) throw err;
        return res.json(result);
    });
});

app.delete('/images', (req, res) => {
    let array = req.body;
    if(array.length > 0) {
        let sql = `delete from instagram.photos where id in (${array.join(",")});`;

        conn.query(sql, function (err, result) {
            if (err) throw err;
            return res.json(result);
        });
    }
});

app.listen(3333);