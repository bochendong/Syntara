;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p2-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
(require spd/tags)

(@assignment exams/2024w1-f/f-p2) ;Do not edit or remove this tag



(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line


(@htdf superfact)
(@signature Natural -> Natural)
;; produce the super factorial of n
(check-expect (superfact 0) (* 1  1))
(check-expect (superfact 1) (* 1  1))
(check-expect (superfact 2) (* 2 1  1))
(check-expect (superfact 3) (* 6 2 1  1))
(check-expect (superfact 4) (* (* 4 3 2 1  1)
                               (* 3 2 1  1)
                               (* 2 1  1)
                               (* 1  1)
                               1))

#;#;
(@template-origin Natural encapsulated)

(define (superfact n)
  (local [(define (fact n)
            (cond [(zero? n) 1]
                  [else
                   (* n (fact (sub1 n)))]))]
    (cond [(zero? n) 1]
          [else
           (* (fact n)
              (superfact (sub1 n)))])))


(@template-origin fn-composition use-abstract-fn)

(define (superfact n1)
  (foldr * 1
         (build-list n1
                     (lambda (n2)
                       (foldr * 1
                              (build-list (add1 n2) add1))))))

