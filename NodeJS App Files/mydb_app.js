///////////////////// Requires & Initial Setup ////////////////////// 
// requires the express,and mysql2 modules
const express = require('express');
const mysql = require('mysql2/promise');

// creates an instance of express and assigns it to the app variable
const app = express();

// assigns the port number to the port variable
const port = 3000;


//////////////////////// Database Connection //////////////////////// 
// Create a pool for better performance instead of a single connection
const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'mydb',
  waitForConnections: true,
  connectionLimit: 50,
  queueLimit: 0
});

// Check if the database is reachable
db.getConnection()
  .then(connection => {
    console.log('Connected to the database');
    connection.release();
  })
  .catch(err => {
    console.error('Error connecting to the database', err);
  });


/////////////////////////// Middleware //////////////////////////////
// to parse JSON data from the body of the request
app.use(express.json());

// Check out the payload of the request for debugging purposes
app.use((req, _res, next) => {
  console.log(`method: ${req.method} \nurl:${req.url} \nbody:${JSON.stringify(req.body)}`);
  next();
});


////////////////////////////// Routes ///////////////////////////////

// Message if accessed through browser
app.get('/', (_req, res) => {
  res.send('Welcome to the Course Management API');
});

//************************** Admin Routes *************************//

// FR1: Admins should be able to enable or disable the availability of a course

// Use PATCH to update the availability attribute directly 
app.patch('/courses/availability', async (req, res) => {
  try {
    const { UserID, courseID, IsAvailable } = req.body;
    const [results] = await db.query(`SELECT RoleID FROM users WHERE UserID = ?`, [UserID]);

    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userRoleID = results[0].RoleID;

    // FR6: Ensure only the authorized access can perform an action.
    // if the RoleID is 1, the user is an admin and can perform CRUD operations on courses.
    if (userRoleID === 1) {
      await db.query(`UPDATE courses SET IsAvailable = ? WHERE CourseID = ?`, [IsAvailable, courseID]);
      res.json({ success: 'Course availability updated' });
    } else {
      res.status(403).json({ error: 'You are not authorised to perform this action' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new course using POST
app.post('/courses', async (req, res) => {
  try {
      const { AdminUserID, CourseTitle, TeacherId, CourseAvailability } = req.body;

      const [results] = await db.query(`SELECT RoleID FROM users WHERE UserID = ?`, [AdminUserID]);
      console.log(results);

      if (results.length === 0) {
          return res.status(404).json({ error: 'Admin not found' });
      }

      const AdminRoleID = results[0].RoleID;
      
      // FR6: Ensure only the authorized access can perform an action.
      // if the RoleID is 1, the user is an admin and can perform CRUD operations on courses.
      if (AdminRoleID === 1) {
          await db.query(`INSERT INTO courses (Title, TeacherID, IsAvailable) VALUES (?, ?, ?)`, [CourseTitle, TeacherId, CourseAvailability]);
          res.json({ success: 'Course created successfully' });
      } else {
          res.status(403).json({ error: 'You are not authorized to perform this action' });
      }
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a course using DELETE
app.delete('/courses', async (req, res) => {
  try {
    const { AdminUserID, courseID } = req.body;

    // FR6: Ensure only the authorized access can perform an action.
    // if the RoleID is 1, the user is an admin and can perform CRUD operations on courses.
    const [adminResults] = await db.query(`SELECT RoleID FROM users WHERE UserID = ?`, [AdminUserID]);
    if (adminResults.length === 0 || adminResults[0].RoleID !== 1) {
      return res.status(403).json({ error: 'You are not authorized to perform this action' });
    }

    // Check if the course exists
    const [courseResults] = await db.query(`SELECT * FROM courses WHERE CourseID = ?`, [courseID]);
    if (courseResults.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Delete the course
    await db.query(`DELETE FROM courses WHERE CourseID = ?`, [courseID]);
    res.json({ success: 'Course deleted successfully' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// FR2: Admins should be able to assign one or more courses to a teacher

// Use PATCH to Udpate the teacherID field.
app.patch('/courses/assignteacher', async (req, res) => {
  try {
      const { AdminUserID, courseID, TeacherUserID } = req.body;

      // gets the RoleID of the user from the users table
      const roleQuery = `SELECT RoleID FROM users WHERE UserID = ?`;

      // executes the roleQuery passing the AdminUserID
      const [results] = await db.query(roleQuery, [AdminUserID]);

      // if the UserID is not found, return 'User not found'
      if (results.length === 0) {
          return res.status(404).json({ error: 'AdminUserID not found' });
      }

      // if the UserID is found, get the RoleID
      const userRoleID = results[0].RoleID;

      // FR6: Ensure only the authorized access can perform an action.
      // if the RoleID is 1, the user is an admin and can perform CRUD operations on courses.
      if (userRoleID === 1) {
          const query = `UPDATE courses SET TeacherID = ? WHERE CourseID = ?`;
          // executes the query passing the TeacherUserID and CourseID
          await db.query(query, [TeacherUserID, courseID]);
          res.json({ success: 'Teacher assigned to course' });
      } else {
          // if the RoleID is not 1, the user is not an admin and cannot assign a teacher to a course
          res.status(403).json({ error: 'You are not authorized to perform this action' });
      }
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
  }
});

//************************* Student Routes ************************//

// FR3: Students can browse and list all the available courses and see 
//      the course title and course teacher’s name.

// List available course titles and corresponding teacher names.
app.get('/courses', async (_req, res) => {
  try {
    const results = await db.query(`
      SELECT courses.Title,
        COALESCE(users.Name, 'TBD') AS TeacherName
      FROM courses
      LEFT JOIN users ON courses.TeacherID = users.UserID
      WHERE courses.IsAvailable = 1
    `);
    res.json(results[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// FR4: Students can enrol in a course. Students should not be able to 
//      enrol in a course more than once at each time. 

// Use POST to create a new enrolment record.
app.post('/student/enroll', async (req, res) => {
  try {
    const { StudentUserID, CourseID } = req.body;

    if (!StudentUserID || !CourseID) {
      return res.status(400).json({ error: 'StudentUserID and CourseID are required' });
    }

    const results = await db.query(`SELECT RoleID FROM users WHERE UserID = ?`, [StudentUserID]);

    if (results[0].length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const userRoleID = results[0][0].RoleID;

    // FR6: Ensure only the authorized access can perform an action.
    // if the RoleID is 3, the user is a student and can self-enrol in a course.
    if (userRoleID !== 3) {
      return res.status(403).json({ error: 'You are not authorized to perform this action' });
    }

    const enrolmentResults = await db.query(`SELECT * FROM enrolments WHERE CourseID = ? AND UserID = ?`, [CourseID, StudentUserID]);

    if (enrolmentResults[0].length > 0) {
      return res.status(409).json({ error: 'Student is already enrolled in this course' });
    }

    await db.query(`INSERT INTO enrolments (Mark, CourseID, UserID) VALUES (NULL, ?, ?)`, [CourseID, StudentUserID]);
    res.json({ success: 'Student enrolled in course' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

//************************* Teacher Routes ************************//

// FR5: Teachers can fail or pass a student.

// Use PATCH to update the mark field within the enrolment record.
app.patch('/enroll/mark', async (req, res) => {
  try {
    const { TeacherUserID, CourseID, StudentUserID, Mark } = req.body;

    const results = await db.query(`SELECT RoleID FROM users WHERE UserID = ?`, [TeacherUserID]);

    if (results[0].length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    const userRoleID = results[0][0].RoleID;

    // FR6: Ensure only the authorized access can perform an action.
    // if the RoleID is 2, the user is a teacher and can update student marks.
    if (userRoleID === 2) {
      await db.query(`UPDATE enrolments SET Mark = ? WHERE CourseID = ? AND UserID =?`, [Mark, CourseID, StudentUserID]);
      res.json({ success: 'Student mark updated' });
    } else {
      res.status(403).json({ error: 'You are not authorized to perform this action' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


///////////////////// Server Start ////////////////////// 
app.listen(port, () => {
console.log(`Server running on http://localhost:${port}`);
});
