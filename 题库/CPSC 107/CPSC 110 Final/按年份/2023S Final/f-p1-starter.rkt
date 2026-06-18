;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-reader.ss" "lang")((modname f-p1-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2023s-f/f-p1)

(@cwl ???)   ;fill in your CWL here (same as for problem sets)


(@problem 1) ;do not edit or delete this line

#|

This is a multiple choice problem on terminology.  The problem asks you to label
parts of a program with the correct technical term for that program element.

To solve this problem you must consult the figure in f-p1-figure.pdf.  In that
figure you will see part of the solution to a problem bank problem.  On that
solution we have marked 8 boxes (A through H) selecting some part of the
program. For each of those boxes you must choose the correct technical term
below.


NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
      IN YOUR SOLUTION.  Failure to follow these requirements may result in
      receiving zero marks for this problem.

 - You MUST NOT EDIT any part of this file other than the values for the
   constants BOX-A through BOX-H below.
 
 - This file includes special check-expects at the bottom that will check
   whether your answer is well-formed when you run the file. If one or more
   answers are not well-formed the test will fail with a message that
   describes what needs to be fixed.
 
 - Run the file EVERY time you edit an answer.
 
 - Note that initially the tests WILL FAIL, because you need to edit your
   answers in for the tests to pass.
 
 - Your submission WILL BE GRADED IF THERE ARE FAILING TESTS.  A failing test
   just means that specific answer is not well-formed.
 
 - Your submission WILL NOT BE GRADED if running it produces red errors.


For each of the constants BOX-A through BOX-H, you must replace "???" with ONE
of the technical term strings below.  It is VERY important to note that:
  
  - most technical terms will not be used, since there are only 8 boxes
  
  - each technical term can only be used once. If you use a string more than
    once then all answers using that string will be marked incorrect
  
  - if more than one technical term applies to a box then you must use
    the most specific term that applies

The terms you may use are:
  "answer expression"
  "argument"
  "atomic distinct"
  "constant definition"
  "constant name"
  "data example"
  "dd template rule"
  "expression"
  "function body"
  "function call expression"
  "function definition"
  "function example"
  "function name"
  "if statement"
  "metadata annotation"
  "operand"
  "parameter"
  "question expression"
  "structure definition"
  "template"
  "type comment"
  "type name"


PRO TIP: COPY AND PASTE the strings above rather than typing them to make sure
there isn't a typo in your answer.

Replace each "???" below with one of the strings above.

|#



(define BOX-A "???")
(define BOX-B "???")
(define BOX-C "???")
(define BOX-D "???")
(define BOX-E "???")
(define BOX-F "???")
(define BOX-G "???")
(define BOX-H "???")


;; ==========================================================================
;; >>>>>>>>   You should not read and you MUST NOT EDIT BELOW HERE   <<<<<<<<
;; ==========================================================================
;;
;; The code below here exists so that running the file will verify that your
;; answers are well-formed.
;;


;; these are named to work well with check-satisfied failures

(define (is-term-string x)
  (member x TERMS))

(check-satisfied BOX-A is-term-string)
(check-satisfied BOX-B is-term-string)
(check-satisfied BOX-C is-term-string)
(check-satisfied BOX-D is-term-string)
(check-satisfied BOX-E is-term-string)
(check-satisfied BOX-F is-term-string)
(check-satisfied BOX-G is-term-string)
(check-satisfied BOX-H is-term-string)


(define TERMS
  (list "answer expression"
        "argument"
        "atomic distinct"
        "constant definition"
        "constant name"
        "data example"
        "dd template rule"
        "expression"
        "function body"
        "function call expression"
        "function definition"
        "function example"
        "function name"
        "if statement"
        "metadata annotation"
        "operand"
        "parameter"
        "question expression"
        "structure definition"
        "template"
        "type comment"
        "type name"))
