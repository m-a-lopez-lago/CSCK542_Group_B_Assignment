// requires the express, body-parser and mysql2 modules
const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');


// creates an instance of express and assigns it to the app variable
const app = express();

// assigns the port number to the port variable
const port = 3000;


// Database Connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'mydb'
});


// Connect to the database
db.connect((err) => {
  if (err) throw err;
  console.log('Connected to the database');
});


// Middleware
// required to parse JSON data from the body of the request
app.use(bodyParser.json());


// Enable or Disable a Course
// Admins should be able to enable or disable the availability of a course
app.post('/courses/availability', (req, res) => {
  const { UserID, CourseID, IsAvailable } = req.body;

  // gets the RoleID of the user from the users table
  const roleQuery = `SELECT RoleID FROM users WHERE UserID = ?`;

  // executes the query
  db.query(roleQuery, [UserID], (err, results) => {
    // if there is an error, throw it
    if (err) {
        throw err;
    }

    // if the UserID is not found, return 'User not found'
    if (results.length === 0) {
        return res.status(404).json({ error: 'User not found' });
    }

    // if the UserID is found, get the RoleID
    const userRoleID = results[0].RoleID;

    // if the RoleID is 1, the user is an admin and can enable or disable a course
    if (userRoleID === 1) {
        // query to update the IsAvailable column in the courses table
        const query = `UPDATE courses SET IsAvailable = ? WHERE CourseID = ?`;

        // executes the query
        db.query(query,[IsAvailable, CourseID], (err, result) => {
            // if there is an error, throw it
            if (err) {
                throw err;
            }
            // if the query is successful, return success: true
            res.json({ success: 'Course availability updated' });
        });
    // if the RoleID is not 1, the user is not an admin and cannot enable or disable a course
    // return 'You are not authorized to perform this action'
    } else {
        res.status(403).json({ error: 'You are not authorized to perform this action' });
    }
    });
});


// Assign Course to Teacher
// Admins should be able to assign one or more courses to a teacher

// app.post is a method to handle post requests
app.post('/courses/assignteacher', (req, res) => {
  const { AdminUserID, CourseID, TeacherUserID } = req.body;

  // gets the RoleID of the user from the users table
  const roleQuery = `SELECT RoleID FROM users WHERE UserID = ?`;

  // executes the roleQuery passing the AdminUserID
  db.query(roleQuery, [AdminUserID], (err, results) => {
    if (err) {
        throw err;
    }
    // if the UserID is not found, return 'User not found'
    if (results.length === 0) {
        return res.status(404).json({ error: 'AdminUserID not found' });
    }

    // if the UserID is found, get the RoleID
    const userRoleID = results[0].RoleID;

    // if the RoleID is 1, the user is an admin and can assign a teacher to a course
    if (userRoleID === 1) {
        const query = `UPDATE courses SET TeacherID = ? WHERE CourseID = ?`;
        // executes the query passing the TeacherUserID and CourseID
        db.query(query,[TeacherUserID, CourseID], (err, result) => {
            if (err) {
                throw err;
            }
            res.json({ success: 'Teacher assigned to course' });
        });
    // if the RoleID is not 1, the user is not an admin and cannot assign a teacher to a course
    } else {
        res.status(403).json({ error: 'You are not authorized to perform this action' });
    }
    });
});


// List Available Courses
app.get('/courses', (req, res) => {
  // query to get the CourseID, Title, TeacherID and TeacherName from the courses and users tables
  const query = `
    SELECT courses.CourseID, courses.Title, users.UserID AS TeacherID, users.Name AS TeacherName
    FROM courses
    JOIN users ON courses.TeacherID = users.UserID
    WHERE courses.IsAvailable = 1
  `;
  db.query(query, (err, results) => {
    if (err) throw err;
    res.json(results);
  });
});


// Enroll Students can enrol in a course. 
// Students should not be able to enrol in a course more than once at each time.
app.post('/student/enroll', (req, res) => {
  const { StudentUserID, CourseID } = req.body;

  // Check if StudentUserID and CourseID are provided
  if(!StudentUserID || !CourseID) {
    return res.status(400).json({ error: 'StudentUserID and CourseID are required' });
  }
  // Get the RoleID of the StudentUserID from the users table
  const roleQuery = `SELECT RoleID FROM users WHERE UserID = ?`;
  // Execute the query passing the StudentUserID
  db.query(roleQuery, [StudentUserID], (err, results) => {
    if (err) {
      throw err;
    }
    // If the StudentUserID is not found, return 'Student not found'
    if (results.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    // If the StudentUserID is found, get the RoleID
    const userRoleID = results[0].RoleID;
    // If the RoleID is not 3, the user is not a student and cannot enrol in a course
    if (userRoleID !== 3) {
      return res.status(403).json({ error: 'You are not authorized to perform this action' });
    }

    // Check if the student is already enrolled in the course
    const checkEnrolmentQuery = `SELECT * FROM enrolments WHERE CourseID = ? AND UserID = ?`;
    // Execute the query passing the CourseID and StudentUserID
    db.query(checkEnrolmentQuery, [CourseID, StudentUserID], (err, results) => {
      if (err) {
        throw err;
      }
      // If the student is already enrolled in the course, return 'Student is already enrolled in this course'
      if(results.length > 0) {
        return res.status(409).json({ error: 'Student is already enrolled in this course' });
      }

      // Enroll the student in the course
      const enrolQuery = `INSERT INTO enrolments (Mark, CourseID, UserID) VALUES (NULL, ?, ?)`;
      db.query(enrolQuery, [CourseID, StudentUserID], (err, result) => {
        if (err) {
          throw err;
        }
        res.json({ success: 'Student enrolled in course' });
      });
    });
  });
});


// Fail or Pass a Student
// teachers can fail or pass a student in a course
app.post('/enroll/mark', (req, res) => {
  const { TeacherUserID, CourseID, StudentUserID, Mark } = req.body;
  
  // Get RoleID of the TeacherUserID from the users table
  const roleQuery = `SELECT RoleID FROM users WHERE UserID = ?`;
  // Execute the query passing the TeacherUserID
  db.query(roleQuery, [TeacherUserID], (err, results) => {
    if (err) {
      throw err;
    }
    // If the TeacherUserID is not found, return 'Teacher not found'
    if (results.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    // If the TeacherUserID is found, get the RoleID
    const userRoleID = results[0].RoleID;
    // If the RoleID is 2, the user is a teacher and can fail or pass a student
    if (userRoleID === 2) {
      // Query to update the Mark of the student in the course
      const query = `UPDATE enrolments SET Mark = ? WHERE CourseID = ? AND UserID =?`;
      // Execute the query passing the Mark, CourseID and StudentUserID
      db.query(query,[Mark, CourseID, StudentUserID], (err, result) => {
        if (err) {
          throw err;
        }
        res.json({ success: 'Student mark updated' });
      });
    } else {
      res.status(403).json({ error: 'You are not authorized to perform this action' });
    } 
  });
});


// Message if accessed through browser
app.get('/', (req, res) => {
  res.send('Welcome to the Course Management API');
});


// Start the server
app.listen(port, () => {
console.log(`Server running on http://localhost:${port}`);
});
