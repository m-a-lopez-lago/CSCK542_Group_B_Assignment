///////////////////// Requires & Initial Setup ////////////////////// 
const express = require('express');
const mysql = require('mysql2/promise');

// define constants
const ADMIN_ROLE = 1;
const TEACHER_ROLE = 2;
const STUDENT_ROLE = 3;
const COURSE_UNAVAILABLE = 0;
const COURSE_AVAILABLE = 1;
const FAIL = 0;
const PASS = 1;

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

// FR6: Ensure only the authorised access can perform an action.
const isAuthorised = async (UserID, RoleID) => {
  const [results] = await db.query(`SELECT RoleID FROM users WHERE UserID = ?`, [UserID]);
  return results.length > 0 && results[0].RoleID === RoleID;
};

// Encapsulate frequent course validation logic
const courseExists = async (CourseID) => {
  const [courseResults] = await db.query(`SELECT 1 FROM courses WHERE CourseID = ? LIMIT 1`, [CourseID]);
  return courseResults.length > 0;
};

// Global internal server error handling 
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

////////////////////////////// Routes ///////////////////////////////

// Welcome message for root endpoint
app.get('/', (_req, res) => {
  res.send('Welcome to the Course Management API');
});

//************************** Admin Routes *************************//

// FR1: Admins should be able to enable or disable the availability of a course

// Use PATCH to update the availability attribute directly 
app.patch('/courses/availability', async (req, res) => {
  try {
    const { AdminID, CourseID, IsAvailable } = req.body;

    // Validate IsAvailable variable
    if (IsAvailable !== COURSE_UNAVAILABLE && IsAvailable !== COURSE_AVAILABLE) {
      return res.status(400).json({ error: 'Invalid availability status. Acceptable values are 0 (unavailable) or 1 (available).' });
    }

    // Only admins and can perform CRUD operations on courses.
    if (!await isAuthorised(AdminID, ADMIN_ROLE)) {
      return res.status(403).json({ error: 'User is not authorised to perform this action' });
    }

    // Check if the course exists
    if (!await courseExists(CourseID)) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Update course availability
    await db.query(`UPDATE courses SET IsAvailable = ? WHERE CourseID = ?`, [IsAvailable, CourseID]);
    res.json({ success: 'Course availability successfully updated' });

  } catch (err) {
      next (err);
  }
});

// Create a new course using POST
app.post('/courses', async (req, res) => {
  try {
      const { AdminID, CourseTitle, TeacherID, IsAvailable } = req.body;

      // Only admins and can perform CRUD operations on courses.
      if (!await isAuthorised(AdminID, ADMIN_ROLE)) {
        return res.status(403).json({ error: 'User is not authorised to perform this action' });
      }

      // Validate IsAvailable if provided
      let validIsAvailable = COURSE_UNAVAILABLE;

      if (IsAvailable) {
        if (IsAvailable !== COURSE_UNAVAILABLE && IsAvailable !== COURSE_AVAILABLE) {
          return res.status(400).json({ error: 'Invalid value for IsAvailable. It should be 0 or 1.' });
        }
        validIsAvailable = IsAvailable; // Set the validated IsAvailable
      }

      // Validate if the teacher exists and is indeed a teacher, if a teacherID is provided.
      // It defaults to 0, which will result in a "TBD" teacher name in the available courses list
      let validTeacherId = 0; 

      // If TeacherId is provided, validate it
      if (TeacherID) {
        if (!await isAuthorised(TeacherID, TEACHER_ROLE)) {
          return res.status(403).json({ error: 'Teacher not found or user is not a teacher' });
        }
        validTeacherId = TeacherID; // Set the validated teacher ID
      }

      // Check if a course with the same title already exists
      const [courseExists] = await db.query(`SELECT 1 FROM courses WHERE Title = ? LIMIT 1`, [CourseTitle]);
      if (courseExists.length > 0) {
        return res.status(400).json({ error: 'A course with this title already exists' });
      }

      // Create the new course
      await db.query(`INSERT INTO courses (Title, TeacherID, IsAvailable) VALUES (?, ?, ?)`, 
        [CourseTitle, validTeacherId, validIsAvailable]);
      res.json({ success: 'Course created successfully' });
    
  } catch (err) {
      next (err);
  }
});

// Delete a course using DELETE to modify the courses offer.
app.delete('/courses', async (req, res) => {
  try {
    const { AdminID, CourseID } = req.body;

    // Only admins and can perform CRUD operations on courses.
    if (!await isAuthorised(AdminID, ADMIN_ROLE)) {
      return res.status(403).json({ error: 'User is not authorised to perform this action' });
    }

    // Validate if the course exists
    if (!await courseExists(CourseID)) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Then check if there are any users enrolled in the course (prevent parent row deletion attempt)
    const [enrolmentResults] = await db.query(`SELECT 1 FROM enrolments WHERE CourseID = ? LIMIT 1`, [CourseID]);
    if (enrolmentResults.length > 0) {
      return res.status(400).json({ error: 'Cannot delete course. There are users enrolled in this course.' });
    }

    // Delete the course
    await db.query(`DELETE FROM courses WHERE CourseID = ?`, [CourseID]);
    res.json({ success: 'Course deleted successfully' });

  } catch (err) {
      next (err);
  }
});

// FR2: Admins should be able to assign one or more courses to a teacher

// Use PATCH to Udpate the teacherID field.
app.patch('/courses/assignteacher', async (req, res) => {
  try {
      const { AdminID, CourseID, TeacherID } = req.body;

      // Only admins and can perform CRUD operations on courses.
      if (!await isAuthorised(AdminID, ADMIN_ROLE)) {
        return res.status(403).json({ error: 'User is not authorised to perform this action' });
      }

      // Validate teacherID
      if (!await isAuthorised(TeacherID, TEACHER_ROLE)) {
        return res.status(403).json({ error: 'Teacher not found or user is not a teacher' });
      }

      // Check if the course exists
      if (!await courseExists(CourseID)) {
        return res.status(404).json({ error: 'Course not found' });
      }

      // Assign the teacher to the course
      const query = `UPDATE courses SET TeacherID = ? WHERE CourseID = ?`;
      await db.query(query, [TeacherID, CourseID]);
      res.json({ success: 'Teacher assigned to course' });

  } catch (err) {
      next (err);
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
      next (err);
  }
});

// FR4: Students can enrol in a course. Students should not be able to 
//      enroll in a course more than once at each time. 

// Use POST to create a new enrolment record.
app.post('/student/enrol', async (req, res) => {
  try {
    const { CourseID, StudentID } = req.body;

    // Validate required fields
    if (!StudentID || !CourseID) {
      return res.status(400).json({ error: 'StudentID and CourseID are required' });
    }

    // Check if user is student and can enrol in a course.
    if (!await isAuthorised(StudentID, STUDENT_ROLE)) {
      return res.status(403).json({ error: 'Student not found. Please check the student ID' });
    }

    // Check if the course exists
    if (!await courseExists(CourseID)) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Check if the course is available for enrolment
    const [IsAvailableResults] = await db.query(`SELECT IsAvailable FROM courses WHERE CourseID = ?`, [CourseID]);
    if (IsAvailableResults[0].IsAvailable !== COURSE_AVAILABLE) {
      return res.status(403).json({ error: 'Course is not available for enrolment' });
    }

    // Check if the student is already enrolled in the course
    const [enrolmentResults] = await db.query(`SELECT 1 FROM enrolments WHERE CourseID = ? AND UserID = ? LIMIT 1`, [CourseID, StudentID]);
    if (enrolmentResults.length > 0) {
      return res.status(409).json({ error: 'Student is already enrolled in this course' });
    }

    // Enrol the student in the course
    await db.query(`INSERT INTO enrolments (Mark, CourseID, UserID) VALUES (NULL, ?, ?)`, [CourseID, StudentID]);
    res.json({ success: 'Student enrolled in course' });

  } catch (err) {
      next (err);
  }
});

//************************* Teacher Routes ************************//

// FR5: Teachers can fail or pass a student.

// Use PATCH to update the mark field within the enrolment record.
app.patch('/enrol/mark', async (req, res) => {
  try {
    const { TeacherID, CourseID, StudentID, Mark } = req.body;

    // Validate required fields
    if (!TeacherID || !CourseID || !StudentID || Mark === undefined) {
      return res.status(400).json({ error: 'TeacherID, CourseID, StudentID, and Mark are required' });
    }

    // Validate mark
    if (Mark !== FAIL && Mark !== PASS) {
      return res.status(400).json({ error: 'Invalid value for Mark. It should be 0 (fail) or 1 (pass).' });
    }

    // Check if user is a teacher and has permission to update marks.
    if (!await isAuthorised(TeacherID, TEACHER_ROLE)) {
      return res.status(403).json({ error: 'User is not authorised to update the mark' });
    }

    // Check if the teacher is assigned to the course
    const [courseResults] = await db.query(`SELECT 1 FROM courses WHERE CourseID = ? AND TeacherID = ? LIMIT 1`, [CourseID, TeacherID]);
    if (courseResults.length === 0) {
      return res.status(403).json({ error: 'Teacher is not authorised to update marks for this course' });
    }

    // Check if the student is enrolled in the course
    const [enrolmentResults] = await db.query(`SELECT 1 FROM enrolments WHERE CourseID = ? AND UserID = ? LIMIT 1`, [CourseID, StudentID]);
    if (enrolmentResults.length === 0) {
      return res.status(404).json({ error: 'Enrolment record not found for the given student and or course ID.' });
    }

    // Update the student's mark for the course
    await db.query(`UPDATE enrolments SET Mark = ? WHERE CourseID = ? AND UserID = ?`, [Mark, CourseID, StudentID]);
    res.json({ success: 'Student mark updated' });

  } catch (err) {
      next (err);
  }
});

///////////////////// Server Start ////////////////////// 
app.listen(port, () => {
console.log(`Server running on http://localhost:${port}`);
});
