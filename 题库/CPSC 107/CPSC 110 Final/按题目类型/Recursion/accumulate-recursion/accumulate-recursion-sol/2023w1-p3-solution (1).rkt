;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p3-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2023w2-f/f-p3) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here (same as for problem sets)


(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line


(@htdf sum-max-so-far)
(@signature (listof Integer) -> Integer)
;; sum elements of loi that are greater than any number before them
(check-expect (sum-max-so-far empty)              0)
(check-expect (sum-max-so-far (list 2 4 6))       (+ 2 4 6))
(check-expect (sum-max-so-far (list 1 2 1 3 3))   (+ 1 2 3))
(check-expect (sum-max-so-far (list 3 2 4 5 2 5)) (+ 3 4 5))

;; *** MUST NOT EDIT ANY LINE ABOVE HERE ***

;(define (sum-max-so-far loi) 0) ;stub

(@template-origin (listof X) accumulator)

(define (sum-max-so-far loi0)
  ;; msf is Integer; max number   seen so far in loi0
  ;; rsf is Integer; sum of maxes seen so far in loi0
  (local [(define (fn-for-loi loi msf rsf)
            (cond [(empty? loi) rsf]
                  [else
                   (fn-for-loi (rest loi)
                               (max (first loi) msf)
                               (if (> (first loi) msf)
                                   (+ rsf (first loi))
                                   rsf))]))]
    (if (empty? loi0)
        0
        (fn-for-loi (rest loi0) (first loi0) (first loi0)))))

