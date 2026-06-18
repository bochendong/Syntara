;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p6-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2021w2-f/f-p6)

(@problem 1)
(@problem 2)
(@problem 3)
(@problem 4)
(@problem 5)
(@problem 6)


(@htdf sum-odd-below)
(@signature Natural -> Natural)
;; produce the sum of the odd naturals < the given number
(check-expect (sum-odd-below 0) 0)
(check-expect (sum-odd-below 6) (+ 1 3 5))
(check-expect (sum-odd-below 7) (+ 1 3 5))


;; SOLUTION

(@template-origin fn-composition use-abstract-fn)

(define (sum-odd-below n)
  (foldr + 0
         (filter odd?
                 (build-list n identity))))
