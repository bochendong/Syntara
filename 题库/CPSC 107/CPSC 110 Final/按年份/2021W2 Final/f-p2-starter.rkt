;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p2-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2021w2-f/f-p2)

(@cwl ???) ;fill in your CWL here (same as for problem sets)

(@problem 1) ;do not edit or delete this line 
(@problem 2) ;do not edit or delete this line 


#|

This problem uses the same data definitions as problems 1 and 3.

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

Complete the design of the following abstract fold function for Challenge.
Note that we have already given you the actual function definition and the
template tag. You must complete the design with a signature, purpose,
function definition and the two following check-expects:

  - uses the fold function to produce a copy of C4
  - uses the fold function to count the total number of tasks in C4,
    which is 5

Be VERY CAREFUL WRITING THE SIGNATURE. The autograder is very picky about
these problems. If you skip the type of one parameter then the types of all
following parameters will probably be marked wrong. On the other hand an
incorrect type typically does not affect anything after it. So work very
carefully to first setup the number of parameters the function has, and be
sure your final answer has types for that many parameters. HINT, there are 7.

This problem will be autograded.  NOTE that all of the following are required.
Violating one or more will cause your solution to receive 0 marks.

  - Files must not have any errors when the Check Syntax button is pressed.
    Press Check Syntax and Run often, and correct any errors early.

  - You MUST NOT edit the provided fold-challenge function definition or
    the template tag.

|#

(@htdf fold-challenge)




(@template-origin encapsulated Challenge (listof Challenge) (listof Task) Task)

(define (fold-challenge c1 c2 c3 c4 b1 b2 ch)
  (local [(define (fn-for-ch ch)
            (c1 (ch-nm ch)
                (fn-for-loc (ch-subs ch))
                (fn-for-lot (ch-lot ch))))
          
          (define (fn-for-loc loc)
            (cond [(empty? loc) b1]
                  [else
                   (c2 (fn-for-ch (first loc))
                       (fn-for-loc (rest loc)))]))
          
          (define (fn-for-lot lot)
            (cond [(empty? lot) b2]
                  [else
                   (c3 (fn-for-t (first lot))
                       (fn-for-lot (rest lot)))]))
          
          (define (fn-for-t t)
            (c4 (task-nm t) (task-hrs t)))]
    (fn-for-ch ch)))
