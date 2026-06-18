;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p5-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #t #t none #f () #f)))
(require spd/tags)

(@assignment exams/2022w2-f/f-p5)




(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line
(@problem 5) ;do not edit or delete this line


(@htdf sum-intervals)
(@signature Natural -> Natural)
;; produce sum of [0, 0] [0, 1] ... [0, n]
(check-expect (sum-intervals 0) (+ 0))
(check-expect (sum-intervals 1) (+ (+ 0)
                                   (+ 1)))
(check-expect (sum-intervals 3) (+ (+ 0)
                                   (+ 1)
                                   (+ 0 1 2)
                                   (+ 0 1 2 3)))
(check-expect (sum-intervals 4) (+ (+ 0)
                                   (+ 0 1)
                                   (+ 0 1 2)
                                   (+ 0 1 2 3)
                                   (+ 0 1 2 3 4)))


(@template-origin fn-composition use-abstract-fn)

(define (sum-intervals n)
  (foldr + 0
         (build-list (add1 n)
                     (lambda (n1)
                       (foldr + 0
                              (build-list (add1 n1) identity))))))
