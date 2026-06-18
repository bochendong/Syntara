;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p1-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2021w2-f/f-p1)



(@problem 1) ;do not edit or delete this line



#|

This problem uses the same data definitions as problems 2 and 3.

|#

(@htdd Challenge)
(define-struct ch (nm subs lot))
;; Challenge is (make-ch String (listof Challenge) (listof Task))
;; interp. a challenge with a name, a list of sub-challenges
;;         and a list of tasks directly related to this challenge

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



;; Functions

(@htdf challenges-with-hours>=)

(@signature Challenge Number -> (listof String))
;; produce names of challenges with at least one task needing hrs to complete
(check-expect (challenges-with-hours>= C2 15) empty)
(check-expect (challenges-with-hours>= C2 14) (list "Chg 2"))
(check-expect (challenges-with-hours>= C2 13) (list "Chg 2"))
(check-expect (challenges-with-hours>= C4 15) empty)
(check-expect (challenges-with-hours>= C4 14) (list "Chg 2"))
(check-expect (challenges-with-hours>= C4  7) (list "Chg 4" "Chg 3" "Chg 2"))
(check-expect (challenges-with-hours>= C4  3) (list "Chg 4" "Chg 3" "Chg 2"))

(@template-origin encapsulated Challenge (listof Challenge) (listof Task) Task)

(define (challenges-with-hours>= ch hrs)
  (local [(define (fn-for-ch ch)
            (if (fn-for-lot (ch-lot ch))
                (cons (ch-nm ch) (fn-for-loc (ch-subs ch)))
                (fn-for-loc (ch-subs ch))))

          (define (fn-for-loc loc)
            (cond [(empty? loc) empty]
                  [else
                   (append (fn-for-ch (first loc))
                           (fn-for-loc (rest loc)))]))

          (define (fn-for-lot lot)
            (cond [(empty? lot) false]
                  [else
                   (or (fn-for-t (first lot))
                       (fn-for-lot (rest lot)))]))
          
          (define (fn-for-t t)
            (>= (task-hrs t) hrs))]
    
    (fn-for-ch ch)))
