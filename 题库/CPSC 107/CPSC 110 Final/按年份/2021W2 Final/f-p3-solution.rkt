;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p3-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2021w2-f/f-p3)



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


(define PART-A-YES/NO "no") 

(define PART-A-WORKLIST ???)
(define PART-A-TANDEM-WORKLIST/S ???)
(define PART-A-VISITED ???)
(define PART-A-RSF ???)


(@htdf total-hours-sr)
(@signature Challenge -> Natural)
;; total hours to complete this challenge, including its subtasks/subchallenges

(check-expect (total-hours-sr C1) 0)
(check-expect (total-hours-sr C2) 24)
(check-expect (total-hours-sr C3) 31)
(check-expect (total-hours-sr C4) 46)

(define (total-hours-sr ch)
  (local [(define (fn-for-ch ch)
            (+ (fn-for-loc (ch-subs ch))
               (fn-for-lot (ch-lot ch))))
          
          (define (fn-for-loc loc)
            (cond [(empty? loc) 0]
                  [else
                   (+ (fn-for-ch (first loc))
                      (fn-for-loc (rest loc)))]))
          
          (define (fn-for-lot lot)
            (cond [(empty? lot) 0]
                  [else
                   (+ (task-hrs (first lot))
                      (fn-for-lot (rest lot)))]))]

    (fn-for-ch ch)))


(define PART-B-YES/NO "yes")

(define PART-B-WORKLIST          1)
(define PART-B-TANDEM-WORKLIST/S 0)
(define PART-B-VISITED           0)
(define PART-B-RSF               8)

(@htdf total-hours-tr)
(@signature Challenge -> Natural)
;; total hours to complete this challenge, including its subtasks/subchallenges
(check-expect (total-hours-tr C1) 0)
(check-expect (total-hours-tr C2) 24)
(check-expect (total-hours-tr C3) 31)
(check-expect (total-hours-tr C4) 46)

(define (total-hours-tr ch)
  (local [(define (fn-for-ch ch ch-wl rsf)
            (fn-for-loc (append (ch-subs ch) ch-wl)
                        (fn-for-lot (ch-lot ch) rsf)))
          
          (define (fn-for-loc ch-wl rsf)
            (cond [(empty? ch-wl) rsf]
                  [else
                   (fn-for-ch (first ch-wl) (rest ch-wl) rsf)]))
          
          (define (fn-for-lot lot rsf)
            (cond [(empty? lot) rsf]
                  [else
                   (fn-for-lot (rest lot)
                               (+ (fn-for-t (first lot)) rsf))]))

          (define (fn-for-t t)
            (task-hrs t))]
    
    (fn-for-ch ch empty 0)))

(define PART-C-YES/NO "yes") 

(define PART-C-WORKLIST          1)
(define PART-C-TANDEM-WORKLIST/S 7)
(define PART-C-VISITED           0)
(define PART-C-RSF               3) ;could be 8?


(@htdf more-tasks-than-parent-tr)
(@signature Challenge -> (listof Challenge))
;; produce all challenges with more direct tasks than their parent challenge
(check-expect (more-tasks-than-parent-tr C1) empty)
(check-expect (more-tasks-than-parent-tr C2) empty)
(check-expect (more-tasks-than-parent-tr C3) (list C2))
(check-expect (more-tasks-than-parent-tr C4) (list C2))

(define (more-tasks-than-parent-tr ch)
  ;; ch-wl is (listof Challenge); primary wl
  ;; pt-wl is (listof Natural);   tandem wl, parent challenge number of tasks
  ;; rsf is (listof Challenge);   challenges with more tasks than parent so far
  (local [(define (fn-for-ch ch ch-wl pt pt-wl rsf)
            (local [(define num-tasks (fn-for-lot (ch-lot ch) 0))]
            (fn-for-loc (append (ch-subs ch) ch-wl)
                        (append (make-list (length (ch-subs ch))
                                           num-tasks)
                                pt-wl)
                         (if (> num-tasks pt)
                             (cons ch rsf)
                             rsf))))
          
          (define (fn-for-loc ch-wl pt-wl rsf)
            (cond [(empty? ch-wl) rsf]
                  [else
                   (fn-for-ch (first ch-wl)
                              (rest ch-wl)
                              (first pt-wl)
                              (rest pt-wl)
                              rsf)]))
          
          (define (fn-for-lot lot sum)
            (cond [(empty? lot) sum]
                  [else
                   (fn-for-lot (rest lot)
                               (+ 1 sum))]))]
    
    (fn-for-ch ch empty +inf.0 empty empty)))
