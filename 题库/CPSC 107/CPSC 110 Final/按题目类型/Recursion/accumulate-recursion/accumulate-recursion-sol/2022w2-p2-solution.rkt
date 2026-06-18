;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p2-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #t #t none #f () #f)))
(require spd/tags)

(@assignment exams/2022w2-f/f-p2)




(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line

(@htdf count-repeats)
(@signature (X X -> Boolean) (listof X) -> Natural)
;; produce count of items in list that same? says are the same as previous item
(check-expect (count-repeats = empty) 0)
(check-expect (count-repeats = (list 1)) 0)
(check-expect (count-repeats = (list 9 5 5 4 5 6 7 7 8 9 9 9 10)) 4)
(check-expect (count-repeats string=? (list "a" "b" "b" "c" "d" "d")) 2)

;; *** do not edit above this line ***

(check-expect (count-repeats = (list 8 8 8 4 5 6 7 7 7 9 8 9 9 10)) 5)
(check-expect (count-repeats string=?
                             (list "couch" "table"
                                   "turquiose" "turquiose"
                                   "cat" "cat"))
              2)


(@template-origin (listof X) accumulator)

(define (count-repeats same? lox0)
  ;; prev is X; element in lox0 that precedes current (first lox)
  ;; rsf is Natural; number of duplicates seen so far
  (local [(define (fn-for-lox lox prev rsf)
            (cond [(empty? lox) rsf]
                  [else
                   (fn-for-lox (rest lox)
                               (first lox)
                               (if (same? (first lox) prev)
                                   (add1 rsf)
                                   rsf))]))]

    (if (empty? lox0)
        0
        (fn-for-lox (rest lox0) (first lox0) 0))))

