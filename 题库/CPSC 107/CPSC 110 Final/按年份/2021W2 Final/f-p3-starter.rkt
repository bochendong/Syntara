;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p3-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2021w2-f/f-p3)

(@cwl ???) ;fill in your CWL here (same as for problem sets)

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line

(define ??? '???) ;do not edit or delete this line,
;;                ;but otherwise please ignore this definition

#|

This problem uses the same data definitions as problems 1 and 2.

|#

(@htdd Task)
(define-struct task (nm hrs))
;; Task is (make-task String Natural)
;; interp. a task with a name and an estimated number of hours to complete
;; CONSTRAINT: hrs > 0

(define T1 (make-task "Task 1" 10))
(define T2 (make-task "Task 2" 14))
(define T3 (make-task "Task 3" 7))
(define T4 (make-task "Task 4" 3))
(define T5 (make-task "Task 5" 12))

(@htdd Challenge)
(define-struct ch (nm subs lot))
;; Challenge is (make-ch String (listof Challenge) (listof Task))
;; interp. a challenge with a name, a list of sub-challenges
;;         and a list of tasks directly related to this challenge

(define C1 (make-ch "Chg 1" empty empty))
(define C2 (make-ch "Chg 2" empty (list T1 T2)))
(define C3 (make-ch "Chg 3" (list C1 C2) (list T3)))
(define C4 (make-ch "Chg 4" (list C3) (list T4 T5)))


(@template-origin encapsulated Challenge (listof Challenge) (listof Task) Task)

(define (fn-for-ch ch)
  (local [(define (fn-for-ch ch)
            (... (ch-nm ch)
                 (fn-for-loc (ch-subs ch))
                 (fn-for-lot (ch-lot ch))))

          (define (fn-for-loc loc)
            (cond [(empty? loc) (...)]
                  [else
                   (... (fn-for-ch (first loc))
                        (fn-for-loc (rest loc)))]))

          (define (fn-for-lot lot)
            (cond [(empty? lot) (...)]
                  [else
                   (... (fn-for-t (first lot))
                        (fn-for-lot (rest lot)))]))

          (define (fn-for-t t)
            (... (task-nm t) (task-hrs t)))]
    (fn-for-ch ch)))


#|

This problem will be autograded.  NOTE that all of the following are required.
Violating one or more will cause your solution to receive 0 marks.

  - Files must not have any errors when the Check Syntax button is pressed.
    Press Check Syntax and Run often, and correct any errors early.

  - This file includes special tests that will check whether your answer to
    the problems in this file is complete and properly formatted. Run your
    file before submitting it and fix any errors that are reported.

There are three parts to this file: A, B and C. Each part asks the same
questions, but about three different function designs. Each part requires
you to edit one or two constant definitions to represent your answer.
Be sure to complete all three parts.


*** PART A ***

Consider the design of a function called total-hours-sr.  The first part
of the function design looks like this:

(@htdf total-hours-sr)
(@signature Challenge -> Natural)
;; total hours to complete this challenge, including its subtasks/subchallenges

(check-expect (total-hours-sr C1) 0)
(check-expect (total-hours-sr C2) 24)
(check-expect (total-hours-sr C3) 31)
(check-expect (total-hours-sr C4) 46)

The function definition MUST USE ORDINARY STRUCTURAL RECURSION. It MUST NOT BE
TAIL RECURSIVE.

Using the design methods in this course, should this function definition be
written using any accumulators?

To answer, first replace "???" in PART-A-YES/NO with "yes" or "no".

|#

(define PART-A-YES/NO "???") ;replace "???" with "yes" or "no"

#|

If you put "no" then you are done with Part A, go on to Part B.  

If it should be written using accumulators, then for each of these four specific
kinds of accumulator below we want to know whether that specific kind of
accumulator is needed and why:

- worklist
- one or more tandem worklists
- visited
- rsf

The possible reasons why are:

1 - to store unvisited children of visited nodes
2 - to store the total hours seen so far
3 - to store challenges with more tasks than their parent
4 - to store parent challenge name
5 - to break cycles
6 - to handle joins
7 - to accumulate information along paths in the data
8 - to accumulate information along tail recursive calls

To answer replace each ??? in PART-A with either 0 to indicate that specific
kind of accumulator is not necessary; or put an integer from 1-8 to indicate
that the accumulator is necessary for the specific reason from the numbered
list above.
|#

(define PART-A-WORKLIST ???)          ;replace every ??? with integer 0-8
(define PART-A-TANDEM-WORKLIST/S ???)
(define PART-A-VISITED ???)
(define PART-A-RSF ???)




#|

*** PART B ***
Consider the design of a function called total-hours-tr.  The first part
of the function design looks like this:

(@htdf total-hours-tr)
(@signature Challenge -> Natural)
;; total hours to complete this challenge, including its subtasks/subchallenges
(check-expect (total-hours-tr C1) 0)
(check-expect (total-hours-tr C2) 24)
(check-expect (total-hours-tr C3) 31)
(check-expect (total-hours-tr C4) 46)

The function definition MUST BE TAIL RECURSIVE.

Using the design methods in this course, should this function definition be
written using any accumulators?

To answer, first replace "???" in PART-B-YES/NO with "yes" or "no".

|#

(define PART-B-YES/NO "???") ;replace "???" with "yes" or "no"

#|

If you put "no" then you are done with Part B, go on to Part C.

If it should be written using accumulators, then for each of these four specific
kinds of accumulator below we want to know whether that specific kind of
accumulator is needed and why:

- worklist
- one or more tandem worklists
- visited
- rsf

The possible reasons why are:

1 - to store unvisited children of visited nodes
2 - to store the total hours seen so far
3 - to store challenges with more tasks than their parent
4 - to store parent challenge name
5 - to break cycles
6 - to handle joins
7 - to accumulate information along paths in the data
8 - to accumulate information along tail recursive calls

To answer replace each ??? in PART-B with either 0 to indicate that specific
kind of accumulator is not necessary; or put an integer from 1-8 to indicate
that the accumulator is necessary for the specific reason from the numbered
list above.
|#

(define PART-B-WORKLIST ???)          ;replace every ??? with integer 0-8
(define PART-B-TANDEM-WORKLIST/S ???)
(define PART-B-VISITED ???)
(define PART-B-RSF ???)

#|
PART C

Consider the design of a function called more-tasks-than-parent-tr.  The
first part of the function design looks like this:

(@htdf more-tasks-than-parent-tr)
(@signature Challenge -> (listof Challenge))
;; produce all challenges with more direct tasks than their parent challenge
(check-expect (more-tasks-than-parent-tr C1) empty)
(check-expect (more-tasks-than-parent-tr C2) empty)
(check-expect (more-tasks-than-parent-tr C3) (list C2))
(check-expect (more-tasks-than-parent-tr C4) (list C2))

The function definition MUST BE TAIL RECURSIVE.

Using the design methods in this course, should this function definition be
written using any accumulators?

To answer, first replace "???" in PART-C-YES/NO with "yes" or "no".

|#

(define PART-C-YES/NO "???") ;replace "???" with "yes" or "no"

#|

If you put "no" then you are done with Part C and done with this problem.

If it should be written using accumulators, then for each of these four specific
kinds of accumulator below we want to know whether that specific kind of
accumulator is needed and why:

- worklist
- one or more tandem worklists
- visited
- rsf

The possible reasons why are:

1 - to store unvisited children of visited nodes
2 - to store the total hours seen so far
3 - to store challenges with more tasks than their parent
4 - to store parent challenge name
5 - to break cycles
6 - to handle joins
7 - to accumulate information along paths in the data
8 - to accumulate information along tail recursive calls

To answer replace each ??? in PART-C with either 0 to indicate that specific
kind of accumulator is not necessary; or put an integer from 1-8 to indicate
that the accumulator is necessary for the specific reason from the numbered
list above.
|#

(define PART-C-WORKLIST ???)          ;replace every ??? with integer 0-8
(define PART-C-TANDEM-WORKLIST/S ???)
(define PART-C-VISITED ???)
(define PART-C-RSF ???)


;; ********** PLEASE DO NOT READ BELOW HERE **************

(check-satisfied PART-A-YES/NO yes-or-no-answer?)
(check-satisfied PART-B-YES/NO yes-or-no-answer?)
(check-satisfied PART-C-YES/NO yes-or-no-answer?)

(check-satisfied PART-A-WORKLIST          one-of-0-to-8-inclusive?)
(check-satisfied PART-A-TANDEM-WORKLIST/S one-of-0-to-8-inclusive?)
(check-satisfied PART-A-VISITED           one-of-0-to-8-inclusive?)
(check-satisfied PART-A-RSF               one-of-0-to-8-inclusive?)

(check-satisfied PART-B-WORKLIST          one-of-0-to-8-inclusive?)
(check-satisfied PART-B-TANDEM-WORKLIST/S one-of-0-to-8-inclusive?)
(check-satisfied PART-B-VISITED           one-of-0-to-8-inclusive?)
(check-satisfied PART-B-RSF               one-of-0-to-8-inclusive?)

(check-satisfied PART-C-WORKLIST          one-of-0-to-8-inclusive?)
(check-satisfied PART-C-TANDEM-WORKLIST/S one-of-0-to-8-inclusive?)
(check-satisfied PART-C-VISITED           one-of-0-to-8-inclusive?)
(check-satisfied PART-C-RSF               one-of-0-to-8-inclusive?)

(define (yes-or-no-answer? x)
  (or (equal? x "yes")
      (equal? x "no")))

(define (one-of-0-to-8-inclusive? x)
  (member x (build-list 9 identity)))
